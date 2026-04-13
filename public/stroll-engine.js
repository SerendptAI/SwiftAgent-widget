/**
 * SwiftAgent Stroll Engine
 *
 * Browser-side crawler that runs in the customer's website.
 *
 * Flow:
 *   1. Capture the host page (the one the widget is on)
 *   2. Discover links (sitemap.xml + robots.txt + DOM)
 *   3. Load each discovered URL into a hidden iframe and capture it
 *   4. Upload a single report to POST /api/v1/public/stroll/{companyId}/report
 *   5. Schedule the next crawl via localStorage so the cron fires on a future visit
 *
 * The crawl runs within one page lifetime — nodes live in memory, not sessionStorage.
 */
(function () {
  "use strict";

  // Don't run inside iframes (prevents recursive execution when crawling pages
  // that also embed the widget).
  if (window !== window.top) return;
  if (window.__SWIFT_AGENT_STROLL_ENGINE__) return;
  window.__SWIFT_AGENT_STROLL_ENGINE__ = true;

  // ── Constants ──────────────────────────────────────────────────────────────
  var MAX_PAGES = 200;
  var MAX_SUB_SITEMAPS = 10;
  var SETTLE_DELAY_MS = 2500;
  var NAV_DELAY_MS = 1000;
  var IFRAME_LOAD_TIMEOUT_MS = 15000;
  var SECTION_CAPTURE_DELAY_MS = 150;
  var SCREENSHOT_QUALITY = 0.7;
  var RECRAWL_INTERVAL_MS = 5 * 60 * 1000;
  var MIN_SECTION_HEIGHT = 50;
  var MIN_FALLBACK_SECTION_HEIGHT = 150;

  var HTML2CANVAS_CDN =
    "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";

  var CRON_KEY = "__swift_stroll_cron__";
  var WIDGET_ROOT_ID = "swift-agent-widget-root";
  var IFRAME_ID = "__swift_stroll_iframe__";

  var MSG = {
    READY: "STROLL_ENGINE_READY",
    START: "STROLL_AUTO_START",
    PROGRESS: "STROLL_PROGRESS",
    UPLOADING: "STROLL_UPLOADING",
    COMPLETE: "STROLL_COMPLETE",
    ERROR: "STROLL_ERROR",
  };

  var INTERACTIVE_SELECTORS =
    'a, button, input, select, textarea, [role="button"], [role="tab"], [role="link"], [role="menuitem"], [onclick], [tabindex]';

  var SECTION_TAGS = [
    "header", "nav", "main", "section", "article", "aside", "footer",
    '[role="banner"]', '[role="navigation"]', '[role="main"]',
    '[role="contentinfo"]', '[role="complementary"]',
  ];

  var UNSAFE_CSS_FN_RE =
    /\b(lab|lch|oklch|oklab|color-mix|color|light-dark|hwb)\s*\([^()]*(?:\([^()]*\)[^()]*)*\)/gi;

  // ── URL helpers ────────────────────────────────────────────────────────────
  function normalizeUrl(url) {
    try {
      var u = new URL(url, window.location.origin);
      if (u.origin !== window.location.origin) return null;
      return (u.origin + u.pathname).replace(/\/$/, "") + u.search;
    } catch (e) {
      return null;
    }
  }

  // ── CSS selector generator ─────────────────────────────────────────────────
  function generateSelector(el) {
    if (el.id) return "#" + el.id;
    var parts = [];
    while (el && el.tagName && el !== el.ownerDocument.body && el !== el.ownerDocument.documentElement) {
      var tag = el.tagName.toLowerCase();
      var parent = el.parentElement;
      if (parent) {
        var siblings = Array.from(parent.children).filter(function (c) {
          return c.tagName === el.tagName;
        });
        if (siblings.length > 1) {
          tag += ":nth-of-type(" + (siblings.indexOf(el) + 1) + ")";
        }
      }
      parts.unshift(tag);
      el = parent;
    }
    return parts.join(" > ");
  }

  // ── Unified element mapper (works for any document/window/root) ────────────
  function mapElements(root, win) {
    var elements = [];
    root.querySelectorAll(INTERACTIVE_SELECTORS).forEach(function (el) {
      if (el.closest("#" + WIDGET_ROOT_ID)) return;

      var rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      var style = win.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return;

      var label =
        (el.innerText && el.innerText.trim().substring(0, 100)) ||
        el.getAttribute("aria-label") ||
        el.getAttribute("title") ||
        el.getAttribute("placeholder") ||
        el.getAttribute("alt") ||
        "";

      var type = "action";
      if (el.tagName === "A" || el.getAttribute("role") === "link") type = "nav";
      else if (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA") type = "input";

      elements.push({
        selector: generateSelector(el),
        label: label,
        type: type,
        href: el.getAttribute("href") || "",
        bbox: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          w: Math.round(rect.width),
          h: Math.round(rect.height),
        },
      });
    });
    return elements;
  }

  // ── Unified link discovery (works for any document) ───────────────────────
  function discoverLinks(doc, visitedSet, queueSet) {
    var seen = new Set();
    var links = [];
    doc.querySelectorAll("a[href]").forEach(function (a) {
      if (a.closest && a.closest("#" + WIDGET_ROOT_ID)) return;

      var href = a.getAttribute("href");
      if (
        !href ||
        href.startsWith("#") ||
        href.startsWith("javascript:") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:")
      ) return;

      var normalized = normalizeUrl(href);
      if (!normalized || seen.has(normalized)) return;
      if (visitedSet.has(normalized) || queueSet.has(normalized)) return;

      seen.add(normalized);
      links.push(normalized);
    });
    return links;
  }

  // ── Section detection ──────────────────────────────────────────────────────
  function detectSections(root) {
    var seen = new Set();
    var sections = [];
    var doc = root.ownerDocument || root;
    var win = doc.defaultView || window;

    SECTION_TAGS.forEach(function (sel) {
      root.querySelectorAll(sel).forEach(function (el) {
        if (seen.has(el) || el.closest("#" + WIDGET_ROOT_ID)) return;
        var rect = el.getBoundingClientRect();
        if (rect.height < MIN_SECTION_HEIGHT || rect.width < 100) return;
        var style = win.getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") return;

        seen.add(el);
        sections.push({ element: el, label: sectionLabel(el) });
      });
    });

    var container = root.querySelector("main") || doc.body || root;
    Array.from(container.children || []).forEach(function (el) {
      if (el.tagName !== "DIV" && el.tagName !== "SECTION") return;
      if (seen.has(el) || el.closest("#" + WIDGET_ROOT_ID)) return;
      var rect = el.getBoundingClientRect();
      if (rect.height < MIN_FALLBACK_SECTION_HEIGHT) return;
      var style = win.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") return;

      seen.add(el);
      sections.push({ element: el, label: sectionLabel(el) });
    });

    return sections;
  }

  function sectionLabel(el) {
    var label = el.tagName.toLowerCase();
    if (el.id) return label + "#" + el.id;
    if (el.className && typeof el.className === "string") {
      return label + "." + el.className.split(" ")[0];
    }
    return label;
  }

  // ── html2canvas clone sanitizer (strips modern CSS funcs that crash it) ───
  function sanitizeClone(clonedDoc) {
    var win = clonedDoc.defaultView || window;

    Array.from(clonedDoc.querySelectorAll("*")).forEach(function (el) {
      try {
        var computed = win.getComputedStyle(el);
        var cssText = computed.cssText;
        if (cssText) {
          el.style.cssText = cssText.replace(UNSAFE_CSS_FN_RE, "#000000");
        } else {
          for (var i = 0; i < computed.length; i++) {
            var prop = computed[i];
            var val = computed.getPropertyValue(prop);
            if (val && UNSAFE_CSS_FN_RE.test(val)) {
              val = val.replace(UNSAFE_CSS_FN_RE, "#000000");
            }
            el.style.setProperty(prop, val);
          }
        }
      } catch (e) {}
    });

    clonedDoc.querySelectorAll('style, link[rel="stylesheet"]').forEach(function (el) {
      el.parentNode.removeChild(el);
    });
  }

  // ── Screenshot capture ─────────────────────────────────────────────────────
  function canvasToDataUrl(canvas) {
    var url = canvas.toDataURL("image/webp", SCREENSHOT_QUALITY);
    if (url.indexOf("data:image/webp") === 0) return url;
    return canvas.toDataURL("image/png");
  }

  function html2canvasOptions(extra) {
    var base = {
      useCORS: true,
      allowTaint: true,
      scale: 1,
      logging: false,
      ignoreElements: function (el) {
        return el.id === WIDGET_ROOT_ID || el.id === IFRAME_ID;
      },
      onclone: sanitizeClone,
    };
    if (extra) {
      for (var k in extra) if (extra.hasOwnProperty(k)) base[k] = extra[k];
    }
    return base;
  }

  // Capture any element using the html2canvas reachable from `win`.
  function captureElement(win, el, extra) {
    var h2c = win.html2canvas || window.html2canvas;
    if (!h2c) return Promise.resolve("");

    return h2c(el, html2canvasOptions(extra))
      .then(canvasToDataUrl)
      .catch(function (err) {
        console.error("[Stroll] Screenshot failed:", err);
        return "";
      });
  }

  function captureFullPage(win, doc) {
    win.scrollTo(0, 0);
    return captureElement(win, doc.body, {
      windowWidth: doc.documentElement.scrollWidth,
      windowHeight: doc.documentElement.scrollHeight,
    });
  }

  function captureSectionNodes(win, sections, url, title) {
    var nodes = [];
    return sections.reduce(function (chain, section) {
      return chain.then(function () {
        section.element.scrollIntoView({ behavior: "instant", block: "start" });
        return delay(SECTION_CAPTURE_DELAY_MS)
          .then(function () {
            return captureElement(win, section.element);
          })
          .then(function (screenshot) {
            if (!screenshot) return;
            nodes.push({
              url: url,
              title: title + " [" + section.label + "]",
              screenshot_base64: screenshot,
              elements: mapElements(section.element, win),
            });
          });
      });
    }, Promise.resolve()).then(function () {
      return nodes;
    });
  }

  // ── Ensure html2canvas is available in a given window ─────────────────────
  function ensureHtml2Canvas(win) {
    if (win.html2canvas) return Promise.resolve();

    // If the top window already has it, share it across origins/windows
    // (same-origin only — iframes of a different origin can't access parent).
    if (win !== window && window.html2canvas) {
      try {
        win.html2canvas = window.html2canvas;
        return Promise.resolve();
      } catch (e) {}
    }

    return new Promise(function (resolve) {
      var doc = win.document;
      var script = doc.createElement("script");
      script.src = HTML2CANVAS_CDN;
      script.onload = function () { resolve(); };
      script.onerror = function () {
        console.error("[Stroll] Failed to load html2canvas");
        resolve();
      };
      doc.head.appendChild(script);
    });
  }

  // ── Sitemap / robots discovery (parallel) ─────────────────────────────────
  function fetchText(url) {
    return fetch(url).then(function (res) {
      return res.ok ? res.text() : "";
    }).catch(function () { return ""; });
  }

  function parseSitemapXml(text) {
    if (!text) return { sitemaps: [], urls: [] };
    try {
      var doc = new DOMParser().parseFromString(text, "text/xml");
      var sitemaps = Array.from(doc.querySelectorAll("sitemap > loc")).map(function (n) {
        return n.textContent.trim();
      });
      var urls = Array.from(doc.querySelectorAll("url > loc")).map(function (n) {
        return n.textContent.trim();
      });
      return { sitemaps: sitemaps, urls: urls };
    } catch (e) {
      return { sitemaps: [], urls: [] };
    }
  }

  function fetchSitemap(url) {
    return fetchText(url).then(parseSitemapXml);
  }

  function extractRobotsSitemaps(text) {
    if (!text) return [];
    return text.split("\n")
      .map(function (line) {
        var m = line.match(/^Sitemap:\s*(.+)/i);
        return m ? m[1].trim() : null;
      })
      .filter(Boolean);
  }

  // Gathers URLs from /sitemap.xml, /sitemap_index.xml, /sitemap-index.xml,
  // and any sitemaps referenced in /robots.txt. Runs fetches in parallel.
  function discoverFromSitemap(origin) {
    var candidates = [
      origin + "/sitemap.xml",
      origin + "/sitemap_index.xml",
      origin + "/sitemap-index.xml",
    ];

    var initial = Promise.all([
      Promise.all(candidates.map(fetchSitemap)),
      fetchText(origin + "/robots.txt").then(extractRobotsSitemaps),
    ]);

    return initial.then(function (results) {
      var firstResults = results[0];
      var robotsSitemaps = results[1];

      var allSitemaps = [];
      var allUrls = [];

      firstResults.forEach(function (r) {
        allSitemaps = allSitemaps.concat(r.sitemaps);
        allUrls = allUrls.concat(r.urls);
      });

      var toFetch = Array.from(new Set(allSitemaps.concat(robotsSitemaps))).slice(0, MAX_SUB_SITEMAPS);

      return Promise.all(toFetch.map(fetchSitemap)).then(function (subResults) {
        subResults.forEach(function (r) {
          allUrls = allUrls.concat(r.urls);
        });
        // Normalize and dedupe
        var seen = new Set();
        var normalized = [];
        allUrls.forEach(function (u) {
          var n = normalizeUrl(u);
          if (n && !seen.has(n)) {
            seen.add(n);
            normalized.push(n);
          }
        });
        return normalized;
      });
    });
  }

  // ── Iframe manager ─────────────────────────────────────────────────────────
  var strollIframe = null;

  function getIframe() {
    if (strollIframe && strollIframe.parentNode) return strollIframe;
    strollIframe = document.createElement("iframe");
    strollIframe.id = IFRAME_ID;
    strollIframe.name = IFRAME_ID;
    strollIframe.style.cssText =
      "position:fixed;top:0;left:0;width:1920px;height:1080px;" +
      "opacity:0;pointer-events:none;z-index:-1;border:none;";
    document.body.appendChild(strollIframe);
    return strollIframe;
  }

  function destroyIframe() {
    if (strollIframe && strollIframe.parentNode) {
      strollIframe.parentNode.removeChild(strollIframe);
    }
    strollIframe = null;
  }

  // Navigates an iframe to a URL and resolves once the page has settled.
  // Cleans up listeners and the timeout fallback on both success and failure.
  function loadInIframe(url) {
    return new Promise(function (resolve) {
      var iframe = getIframe();
      var settled = false;
      var timeoutId = null;

      function cleanup() {
        iframe.removeEventListener("load", onLoad);
        if (timeoutId) clearTimeout(timeoutId);
      }

      function finish() {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(iframe);
      }

      function onLoad() {
        setTimeout(finish, SETTLE_DELAY_MS);
      }

      iframe.addEventListener("load", onLoad);
      timeoutId = setTimeout(finish, IFRAME_LOAD_TIMEOUT_MS);
      iframe.src = url;
    });
  }

  // ── Cross-origin-safe iframe accessor ──────────────────────────────────────
  function iframeWindow(iframe) {
    try { return iframe.contentWindow || null; } catch (e) { return null; }
  }

  function iframeDocument(iframe) {
    try {
      return iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document) || null;
    } catch (e) { return null; }
  }

  // ── Utility ────────────────────────────────────────────────────────────────
  function delay(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function notifyWidget(data) {
    window.postMessage(data, "*");
  }

  // ── Crawler ────────────────────────────────────────────────────────────────
  function createCrawler(companyId, baseUrl) {
    var visited = new Set();
    var queue = [];
    var queueSet = new Set();
    var nodes = [];

    function enqueue(urls) {
      urls.forEach(function (url) {
        if (!visited.has(url) && !queueSet.has(url)) {
          queueSet.add(url);
          queue.push(url);
        }
      });
      var cap = MAX_PAGES - visited.size;
      if (queue.length > cap) {
        queue.length = Math.max(0, cap);
      }
    }

    function progress(pageTitle) {
      notifyWidget({
        type: MSG.PROGRESS,
        captured: visited.size,
        remaining: queue.length,
        pageTitle: pageTitle,
      });
    }

    // Captures the host page (full page + sections), then seeds the queue
    // from sitemap + DOM links.
    function crawlHostPage() {
      var url = window.location.href;
      var normalized = normalizeUrl(url);
      visited.add(normalized);

      console.log("[Stroll] Host page:", document.title);

      return ensureHtml2Canvas(window)
        .then(function () { return captureFullPage(window, document); })
        .then(function (screenshot) {
          nodes.push({
            url: url,
            title: document.title,
            screenshot_base64: screenshot,
            elements: mapElements(document, window),
          });

          // Capture sections for the host page too
          var sections = detectSections(document);
          return captureSectionNodes(window, sections, url, document.title)
            .then(function (sectionNodes) {
              sectionNodes.forEach(function (n) { nodes.push(n); });
            });
        })
        .then(function () {
          return Promise.all([
            discoverFromSitemap(window.location.origin),
            Promise.resolve(discoverLinks(document, visited, queueSet)),
          ]);
        })
        .then(function (results) {
          enqueue(results[0]);
          enqueue(results[1]);
          console.log("[Stroll] Discovered " + queue.length + " pages to crawl");
          progress(document.title);
        });
    }

    // Processes a single URL via the hidden iframe.
    function crawlIframePage(url) {
      if (visited.has(url)) return Promise.resolve();
      visited.add(url);

      console.log(
        "[Stroll] Iframe (" + visited.size + "/" + (visited.size + queue.length) + "):",
        url
      );

      return loadInIframe(url).then(function (iframe) {
        var win = iframeWindow(iframe);
        var doc = iframeDocument(iframe);
        if (!win || !doc) {
          console.warn("[Stroll] Cross-origin iframe — skipping:", url);
          return;
        }

        var title = doc.title || url;

        enqueue(discoverLinks(doc, visited, queueSet));

        return ensureHtml2Canvas(win)
          .then(function () { return captureFullPage(win, doc); })
          .then(function (screenshot) {
            nodes.push({
              url: url,
              title: title,
              screenshot_base64: screenshot,
              elements: mapElements(doc, win),
            });

            var sections = detectSections(doc);
            return captureSectionNodes(win, sections, url, title);
          })
          .then(function (sectionNodes) {
            sectionNodes.forEach(function (n) { nodes.push(n); });
            progress(title);
          });
      });
    }

    // Drains the queue, then resolves with all captured nodes.
    function drainQueue() {
      if (queue.length === 0) return Promise.resolve(nodes);

      var nextUrl = queue.shift();
      queueSet.delete(nextUrl);

      return delay(NAV_DELAY_MS)
        .then(function () { return crawlIframePage(nextUrl); })
        .catch(function (err) {
          console.error("[Stroll] Page error:", nextUrl, err);
        })
        .then(drainQueue);
    }

    return {
      run: function () {
        return crawlHostPage().then(drainQueue).then(function () {
          destroyIframe();
          return nodes;
        });
      },
      companyId: companyId,
      baseUrl: baseUrl,
    };
  }

  // ── Upload ─────────────────────────────────────────────────────────────────
  function uploadReport(baseUrl, companyId, nodes) {
    if (nodes.length === 0) {
      console.log("[Stroll] Nothing to upload.");
      return Promise.resolve(false);
    }

    var url = baseUrl + "/api/v1/public/stroll/" + companyId + "/report";
    var payload = {
      dashboard_url: window.location.origin,
      nodes: nodes,
    };

    notifyWidget({ type: MSG.UPLOADING, count: nodes.length });
    console.log("[Stroll] Uploading " + nodes.length + " nodes");

    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(function (res) {
      if (res.ok || res.status === 202) {
        console.log("[Stroll] Upload success!");
        notifyWidget({ type: MSG.COMPLETE, count: nodes.length });
        return true;
      }
      return res.text().then(function (t) {
        console.error("[Stroll] Upload failed:", res.status, t);
        notifyWidget({ type: MSG.ERROR, message: "Upload failed (" + res.status + ")" });
        return false;
      });
    }).catch(function (err) {
      console.error("[Stroll] Upload error:", err);
      notifyWidget({ type: MSG.ERROR, message: err.message || "Network error" });
      return false;
    });
  }

  // ── Cron scheduling (via localStorage, survives tab close) ─────────────────
  function scheduleNextCrawl(companyId, baseUrl) {
    try {
      localStorage.setItem(CRON_KEY, JSON.stringify({
        companyId: companyId,
        baseUrl: baseUrl,
        nextRunAt: Date.now() + RECRAWL_INTERVAL_MS,
      }));
      console.log("[Stroll] Next crawl scheduled in " + (RECRAWL_INTERVAL_MS / 60000) + "min");
    } catch (e) {}
  }

  function getCronSchedule() {
    try {
      var raw = localStorage.getItem(CRON_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function isCronDue(cron, companyId) {
    return cron && cron.companyId === companyId && cron.nextRunAt && Date.now() >= cron.nextRunAt;
  }

  function triggerBackendStroll(baseUrl, companyId) {
    return fetch(baseUrl + "/api/v1/stroll/" + companyId + "/run", { method: "POST" })
      .catch(function () {});
  }

  // ── Entry point ────────────────────────────────────────────────────────────
  var activeCrawl = null;

  function startCrawl(companyId, baseUrl) {
    if (activeCrawl) return;

    console.log("[Stroll] Starting crawl...");
    var crawler = createCrawler(companyId, baseUrl);
    activeCrawl = crawler;

    crawler.run()
      .then(function (nodes) {
        return uploadReport(baseUrl, companyId, nodes);
      })
      .then(function (uploaded) {
        if (uploaded) {
          scheduleNextCrawl(companyId, baseUrl);
        }
      })
      .catch(function (err) {
        console.error("[Stroll] Crawl error:", err);
      })
      .then(function () {
        destroyIframe();
        activeCrawl = null;
      });
  }

  // ── Message listener (from widget / cron) ──────────────────────────────────
  window.addEventListener("message", function (event) {
    var data = event.data;
    if (!data || data.type !== MSG.START) return;
    if (!data.companyId || !data.baseUrl) return;

    var cron = getCronSchedule();
    // Skip if scheduled but not yet due (unless forced)
    if (!data.force && cron && cron.companyId === data.companyId && !isCronDue(cron, data.companyId)) {
      console.log("[Stroll] Next crawl scheduled for " + new Date(cron.nextRunAt).toISOString());
      return;
    }

    if (data.force) {
      try { localStorage.removeItem(CRON_KEY); } catch (e) {}
    }

    setTimeout(function () {
      startCrawl(data.companyId, data.baseUrl);
    }, SETTLE_DELAY_MS);
  });

  // ── Cron check on page load ────────────────────────────────────────────────
  function checkCronOnLoad() {
    var cron = getCronSchedule();
    if (!cron) return;

    if (Date.now() >= cron.nextRunAt) {
      console.log("[Stroll] Cron due — triggering re-crawl");
      triggerBackendStroll(cron.baseUrl, cron.companyId);
      notifyWidget({
        type: MSG.START,
        companyId: cron.companyId,
        baseUrl: cron.baseUrl,
        force: true,
      });
    }
  }

  if (document.readyState === "complete") {
    setTimeout(checkCronOnLoad, SETTLE_DELAY_MS);
  } else {
    window.addEventListener("load", function () {
      setTimeout(checkCronOnLoad, SETTLE_DELAY_MS);
    });
  }

  // Re-check the cron schedule periodically so recrawls fire even if the user
  // stays on the same page without navigating away.
  setInterval(checkCronOnLoad, RECRAWL_INTERVAL_MS);

  notifyWidget({ type: MSG.READY });
})();
