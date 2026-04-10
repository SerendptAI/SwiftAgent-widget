/**
 * SwiftAgent Stroll Engine
 *
 * Runs in the PARENT page (the customer's website).
 * Automatically crawls every page on the site, captures screenshots,
 * maps interactive elements, and uploads a full report to the backend.
 *
 * Flow:
 * 1. On each page: wait for settle, screenshot, map elements, store node
 * 2. Navigate to next unvisited internal link
 * 3. When queue is empty: upload full report via POST /api/v1/public/stroll/{company_id}/report
 *
 * State persists across page loads via sessionStorage.
 */
(function () {
  "use strict";

  if (window.__SWIFT_AGENT_STROLL_ENGINE__) return;
  window.__SWIFT_AGENT_STROLL_ENGINE__ = true;

  // ── Config ─────────────────────────────────────────────────────────────────
  var STORAGE_KEY = "__swift_stroll_state__";
  var NODES_KEY = "__swift_stroll_nodes__";
  var CRON_KEY = "__swift_stroll_cron__";
  var MAX_PAGES = 200;
  var SETTLE_DELAY = 2500;
  var NAV_DELAY = 1000;
  var SCREENSHOT_QUALITY = 0.7;
  var RECRAWL_INTERVAL_MS = 60 * 60 * 1000; // Re-crawl every 60 minutes
  var HTML2CANVAS_CDN =
    "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";

  // ── State helpers (sessionStorage) ─────────────────────────────────────────
  function getState() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function setState(state) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error("[Stroll] Failed to save state:", e);
    }
  }

  function getNodes() {
    try {
      var raw = sessionStorage.getItem(NODES_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function addNode(node) {
    var nodes = getNodes();
    nodes.push(node);
    try {
      sessionStorage.setItem(NODES_KEY, JSON.stringify(nodes));
    } catch (e) {
      console.error("[Stroll] Failed to save node (storage full?):", e);
    }
  }

  function clearAll() {
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(NODES_KEY);
  }

  function initState(companyId, baseUrl) {
    return {
      companyId: companyId,
      baseUrl: baseUrl,
      active: true,
      visited: [],
      queue: [],
      startedAt: new Date().toISOString(),
      _doneKey: "__swift_stroll_done_" + companyId + "__",
    };
  }

  // ── Load html2canvas ───────────────────────────────────────────────────────
  function loadHtml2Canvas() {
    return new Promise(function (resolve) {
      if (window.html2canvas) {
        resolve();
        return;
      }
      var script = document.createElement("script");
      script.src = HTML2CANVAS_CDN;
      script.onload = function () {
        resolve();
      };
      script.onerror = function () {
        console.error("[Stroll] Failed to load html2canvas");
        resolve();
      };
      document.head.appendChild(script);
    });
  }

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
    while (el && el !== document.body && el !== document.documentElement) {
      var tag = el.tagName.toLowerCase();
      var parent = el.parentElement;
      if (parent) {
        var siblings = Array.from(parent.children).filter(function (c) {
          return c.tagName === el.tagName;
        });
        if (siblings.length > 1) {
          var idx = siblings.indexOf(el) + 1;
          tag += ":nth-of-type(" + idx + ")";
        }
      }
      parts.unshift(tag);
      el = parent;
    }
    return parts.join(" > ");
  }

  // ── Discover internal links ────────────────────────────────────────────────
  function discoverLinks(visited, queue) {
    var links = [];
    var seen = {};
    var allAnchors = document.querySelectorAll("a[href]");

    allAnchors.forEach(function (a) {
      if (a.closest("#swift-agent-widget-root")) return;

      var href = a.getAttribute("href");
      if (
        !href ||
        href.startsWith("#") ||
        href.startsWith("javascript:") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:")
      )
        return;

      var normalized = normalizeUrl(href);
      if (!normalized) return;
      if (seen[normalized]) return;
      if (visited.indexOf(normalized) !== -1) return;
      if (queue.indexOf(normalized) !== -1) return;

      seen[normalized] = true;
      links.push(normalized);
    });

    return links;
  }

  // ── Parse sitemap.xml to seed the crawl queue ──────────────────────────────
  function fetchSitemap(visited, queue) {
    var sitemapUrls = [
      window.location.origin + "/sitemap.xml",
      window.location.origin + "/sitemap_index.xml",
      window.location.origin + "/sitemap-index.xml",
    ];

    function parseSitemapXml(text) {
      var links = [];
      try {
        var parser = new DOMParser();
        var doc = parser.parseFromString(text, "text/xml");

        // Check for sitemap index (contains <sitemap><loc>...</loc></sitemap>)
        var sitemapLocs = doc.querySelectorAll("sitemap > loc");
        if (sitemapLocs.length > 0) {
          // Return sub-sitemap URLs to fetch next
          var subUrls = [];
          sitemapLocs.forEach(function (loc) {
            subUrls.push(loc.textContent.trim());
          });
          return { type: "index", urls: subUrls };
        }

        // Regular sitemap — extract <url><loc>...</loc></url>
        var urlLocs = doc.querySelectorAll("url > loc");
        urlLocs.forEach(function (loc) {
          var normalized = normalizeUrl(loc.textContent.trim());
          if (
            normalized &&
            visited.indexOf(normalized) === -1 &&
            queue.indexOf(normalized) === -1 &&
            links.indexOf(normalized) === -1
          ) {
            links.push(normalized);
          }
        });
        return { type: "urls", urls: links };
      } catch (e) {
        return { type: "urls", urls: [] };
      }
    }

    function fetchAndParse(url) {
      return fetch(url)
        .then(function (res) {
          if (!res.ok) return { type: "urls", urls: [] };
          return res.text().then(parseSitemapXml);
        })
        .catch(function () {
          return { type: "urls", urls: [] };
        });
    }

    // Try each sitemap URL, collect all discovered page URLs
    var allLinks = [];

    return sitemapUrls
      .reduce(function (chain, url) {
        return chain.then(function () {
          return fetchAndParse(url).then(function (result) {
            if (result.type === "index") {
              // Fetch each sub-sitemap
              return result.urls
                .slice(0, 10) // cap sub-sitemaps
                .reduce(function (subChain, subUrl) {
                  return subChain.then(function () {
                    return fetchAndParse(subUrl).then(function (subResult) {
                      allLinks = allLinks.concat(subResult.urls);
                    });
                  });
                }, Promise.resolve());
            } else {
              allLinks = allLinks.concat(result.urls);
            }
          });
        });
      }, Promise.resolve())
      .then(function () {
        // Deduplicate
        var seen = {};
        return allLinks.filter(function (url) {
          if (seen[url]) return false;
          seen[url] = true;
          return true;
        });
      });
  }

  // ── Fetch robots.txt for additional sitemap references ─────────────────────
  function fetchRobotsSitemaps(visited, queue) {
    return fetch(window.location.origin + "/robots.txt")
      .then(function (res) {
        if (!res.ok) return [];
        return res.text().then(function (text) {
          var links = [];
          var lines = text.split("\n");
          lines.forEach(function (line) {
            var match = line.match(/^Sitemap:\s*(.+)/i);
            if (match) {
              var url = match[1].trim();
              var normalized = normalizeUrl(url);
              if (normalized) links.push(url);
            }
          });
          return links;
        });
      })
      .catch(function () {
        return [];
      });
  }

  // ── Combined discovery: sitemap + robots.txt + DOM links ───────────────────
  function fullDiscovery(state) {
    var visited = state.visited;
    var queue = state.queue;

    return Promise.all([
      fetchSitemap(visited, queue),
      fetchRobotsSitemaps(visited, queue),
    ]).then(function (results) {
      var sitemapLinks = results[0];
      var robotsSitemapUrls = results[1];

      // If robots.txt had sitemap URLs we haven't tried, fetch them too
      var extraPromises = robotsSitemapUrls.map(function (url) {
        return fetch(url)
          .then(function (res) {
            if (!res.ok) return [];
            return res.text().then(function (text) {
              try {
                var parser = new DOMParser();
                var doc = parser.parseFromString(text, "text/xml");
                var locs = doc.querySelectorAll("url > loc");
                var links = [];
                locs.forEach(function (loc) {
                  var n = normalizeUrl(loc.textContent.trim());
                  if (n && visited.indexOf(n) === -1 && queue.indexOf(n) === -1)
                    links.push(n);
                });
                return links;
              } catch (e) {
                return [];
              }
            });
          })
          .catch(function () {
            return [];
          });
      });

      return Promise.all(extraPromises).then(function (extraResults) {
        var allExtra = [];
        extraResults.forEach(function (r) {
          allExtra = allExtra.concat(r);
        });

        // Combine sitemap + robots + DOM-discovered links
        var domLinks = discoverLinks(visited, queue);
        var combined = sitemapLinks.concat(allExtra).concat(domLinks);

        // Deduplicate
        var seen = {};
        visited.forEach(function (v) { seen[v] = true; });
        queue.forEach(function (q) { seen[q] = true; });

        return combined.filter(function (url) {
          if (seen[url]) return false;
          seen[url] = true;
          return true;
        });
      });
    });
  }

  // ── Map interactive elements (matches backend schema) ──────────────────────
  function mapInteractiveElements() {
    var selectors =
      'a, button, input, select, textarea, [role="button"], [role="tab"], [role="link"], [role="menuitem"], [onclick], [tabindex]';
    var allEls = document.querySelectorAll(selectors);
    var elements = [];

    allEls.forEach(function (el) {
      if (el.closest("#swift-agent-widget-root")) return;

      var rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      var style = window.getComputedStyle(el);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.opacity === "0"
      )
        return;

      var label = "";
      if (el.innerText) label = el.innerText.trim().substring(0, 100);
      else if (el.getAttribute("aria-label"))
        label = el.getAttribute("aria-label");
      else if (el.getAttribute("title")) label = el.getAttribute("title");
      else if (el.getAttribute("placeholder"))
        label = el.getAttribute("placeholder");
      else if (el.getAttribute("alt")) label = el.getAttribute("alt");

      var type = "action";
      if (el.tagName === "A" || el.getAttribute("role") === "link")
        type = "nav";
      else if (
        el.tagName === "INPUT" ||
        el.tagName === "SELECT" ||
        el.tagName === "TEXTAREA"
      )
        type = "input";

      elements.push({
        selector: generateSelector(el),
        label: label || "",
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

  // ── html2canvas clone sanitizer (fixes modern CSS crashes) ─────────────────
  function sanitizeClone(clonedDoc) {
    var win = clonedDoc.defaultView || window;
    var allEls = clonedDoc.querySelectorAll("*");
    var unsafeFnRe =
      /\b(lab|lch|oklch|oklab|color-mix|color|light-dark|hwb)\s*\([^()]*(?:\([^()]*\)[^()]*)*\)/gi;

    for (var i = 0; i < allEls.length; i++) {
      var el = allEls[i];
      try {
        var computed = win.getComputedStyle(el);
        var cssText = computed.cssText;
        if (cssText) {
          el.style.cssText = cssText.replace(unsafeFnRe, "#000000");
        } else {
          for (var j = 0; j < computed.length; j++) {
            var prop = computed[j];
            var val = computed.getPropertyValue(prop);
            if (val && unsafeFnRe.test(val)) {
              val = val.replace(unsafeFnRe, "#000000");
            }
            el.style.setProperty(prop, val);
          }
        }
      } catch (e) {
        /* skip */
      }
    }

    var sheets = clonedDoc.querySelectorAll('style, link[rel="stylesheet"]');
    for (var k = 0; k < sheets.length; k++) {
      sheets[k].parentNode.removeChild(sheets[k]);
    }
  }

  // ── Screenshot helpers ─────────────────────────────────────────────────────
  function canvasToDataUrl(canvas) {
    var url = canvas.toDataURL("image/webp", SCREENSHOT_QUALITY);
    if (url.indexOf("data:image/webp") === 0) return url;
    return canvas.toDataURL("image/png");
  }

  var SECTION_CAPTURE_DELAY = 150;

  // ── Detect page sections ───────────────────────────────────────────────────
  function detectSections() {
    var sectionSelectors = [
      "header", "nav", "main", "section", "article", "aside", "footer",
      '[role="banner"]', '[role="navigation"]', '[role="main"]',
      '[role="contentinfo"]', '[role="complementary"]',
    ];

    var seen = new Set();
    var sections = [];

    sectionSelectors.forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el) {
        if (seen.has(el)) return;
        if (el.closest("#swift-agent-widget-root")) return;
        var rect = el.getBoundingClientRect();
        if (rect.height < 50 || rect.width < 100) return;
        var style = window.getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") return;
        seen.add(el);
        var label = el.tagName.toLowerCase();
        if (el.id) label += "#" + el.id;
        else if (el.className && typeof el.className === "string")
          label += "." + el.className.split(" ")[0];
        sections.push({ element: el, label: label });
      });
    });

    // Fallback: large top-level divs
    var container = document.querySelector("main") || document.body;
    Array.from(container.children).forEach(function (el) {
      if (el.tagName !== "DIV" && el.tagName !== "SECTION") return;
      if (seen.has(el)) return;
      if (el.closest("#swift-agent-widget-root")) return;
      var rect = el.getBoundingClientRect();
      if (rect.height < 150) return;
      var style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") return;
      seen.add(el);
      var label = "div";
      if (el.id) label += "#" + el.id;
      else if (el.className && typeof el.className === "string")
        label += "." + el.className.split(" ")[0];
      sections.push({ element: el, label: label });
    });

    return sections;
  }

  // ── Capture a single element ───────────────────────────────────────────────
  function captureElement(el, opts) {
    if (!window.html2canvas) return Promise.resolve("");

    return window
      .html2canvas(el, Object.assign({
        useCORS: true,
        allowTaint: true,
        scale: 1,
        logging: false,
        ignoreElements: function (element) {
          return element.id === "swift-agent-widget-root";
        },
        onclone: sanitizeClone,
      }, opts || {}))
      .then(function (canvas) {
        return canvasToDataUrl(canvas);
      })
      .catch(function (err) {
        console.error("[Stroll] Screenshot failed:", err);
        return "";
      });
  }

  function captureFullPage() {
    window.scrollTo(0, 0);
    return captureElement(document.body, {
      windowWidth: document.documentElement.scrollWidth,
      windowHeight: document.documentElement.scrollHeight,
    });
  }

  // ── Capture sections sequentially ──────────────────────────────────────────
  function captureSectionNodes(sections, pageUrl, pageTitle) {
    var results = [];
    var index = 0;

    return new Promise(function (resolve) {
      function next() {
        if (index >= sections.length) {
          resolve(results);
          return;
        }
        var section = sections[index];
        index++;

        section.element.scrollIntoView({ behavior: "instant", block: "start" });

        setTimeout(function () {
          // Map elements within this section
          var sectionEls = [];
          var interactives = section.element.querySelectorAll(
            'a, button, input, select, textarea, [role="button"], [onclick]'
          );
          interactives.forEach(function (el) {
            var rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;
            var label = "";
            if (el.innerText) label = el.innerText.trim().substring(0, 100);
            else if (el.getAttribute("aria-label")) label = el.getAttribute("aria-label");
            sectionEls.push({
              selector: generateSelector(el),
              label: label || "",
              type: el.tagName === "A" ? "nav" : "action",
              href: el.getAttribute("href") || "",
              bbox: {
                x: Math.round(rect.x),
                y: Math.round(rect.y),
                w: Math.round(rect.width),
                h: Math.round(rect.height),
              },
            });
          });

          captureElement(section.element).then(function (screenshot) {
            if (screenshot) {
              results.push({
                url: pageUrl,
                title: pageTitle + " [" + section.label + "]",
                screenshot_base64: screenshot,
                elements: sectionEls,
              });
            }
            next();
          });
        }, SECTION_CAPTURE_DELAY);
      }
      next();
    });
  }

  // ── Upload full report ─────────────────────────────────────────────────────
  function uploadReport(state) {
    var nodes = getNodes();

    if (nodes.length === 0) {
      console.log("[Stroll] Nothing to upload.");
      clearAll();
      return;
    }

    var url =
      state.baseUrl +
      "/api/v1/public/stroll/" +
      state.companyId +
      "/report";

    var payload = {
      dashboard_url: window.location.origin,
      nodes: nodes,
    };

    notifyWidget({
      type: "STROLL_UPLOADING",
      count: nodes.length,
    });

    console.log("[Stroll] Uploading report: " + nodes.length + " pages");

    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function (res) {
        if (res.ok || res.status === 202) {
          console.log("[Stroll] Upload success!");
          notifyWidget({
            type: "STROLL_COMPLETE",
            count: nodes.length,
          });
          if (state._doneKey) sessionStorage.setItem(state._doneKey, "true");
          clearAll();
        } else {
          res.text().then(function (t) {
            console.error("[Stroll] Upload failed:", res.status, t);
          });
          notifyWidget({
            type: "STROLL_ERROR",
            message: "Upload failed (" + res.status + ")",
          });
          // Keep state for retry on next load
          state.active = false;
          setState(state);
        }
      })
      .catch(function (err) {
        console.error("[Stroll] Upload error:", err);
        notifyWidget({
          type: "STROLL_ERROR",
          message: err.message || "Network error",
        });
        state.active = false;
        setState(state);
      });
  }

  // ── Notify widget via postMessage ──────────────────────────────────────────
  function notifyWidget(data) {
    window.postMessage(data, "*");
  }

  // ── Hidden iframe for crawling without leaving the page ──────────────────────
  var strollIframe = null;

  function getOrCreateIframe() {
    if (strollIframe && strollIframe.parentNode) return strollIframe;
    strollIframe = document.createElement("iframe");
    strollIframe.id = "__swift_stroll_iframe__";
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

  // Load a URL in the iframe and wait for it to settle
  function loadInIframe(url) {
    return new Promise(function (resolve) {
      var iframe = getOrCreateIframe();
      var loaded = false;

      function onLoad() {
        if (loaded) return;
        loaded = true;
        iframe.removeEventListener("load", onLoad);
        // Wait for page to settle (SPA rendering, lazy loads)
        setTimeout(function () {
          resolve(iframe);
        }, SETTLE_DELAY);
      }

      iframe.addEventListener("load", onLoad);
      iframe.src = url;

      // Timeout fallback if load never fires
      setTimeout(function () {
        if (!loaded) {
          loaded = true;
          iframe.removeEventListener("load", onLoad);
          resolve(iframe);
        }
      }, SETTLE_DELAY + 10000);
    });
  }

  // ── Capture from an iframe's document ──────────────────────────────────────
  function captureIframePage(iframe) {
    try {
      var doc = iframe.contentDocument || iframe.contentWindow.document;
      var win = iframe.contentWindow;
      if (!doc || !doc.body) return Promise.resolve("");
      if (!win.html2canvas) {
        // Inject html2canvas into iframe
        return new Promise(function (resolve) {
          var script = doc.createElement("script");
          script.src = HTML2CANVAS_CDN;
          script.onload = function () {
            doCapture(doc, win, resolve);
          };
          script.onerror = function () { resolve(""); };
          doc.head.appendChild(script);
        });
      }
      return new Promise(function (resolve) {
        doCapture(doc, win, resolve);
      });
    } catch (e) {
      // Cross-origin iframe — can't access
      console.error("[Stroll] Can't access iframe (cross-origin?):", e);
      return Promise.resolve("");
    }
  }

  function doCapture(doc, win, resolve) {
    win.html2canvas(doc.body, {
      useCORS: true,
      allowTaint: true,
      scale: 1,
      logging: false,
      ignoreElements: function (el) {
        return el.id === "swift-agent-widget-root" || el.id === "__swift_stroll_iframe__";
      },
      onclone: sanitizeClone,
    }).then(function (canvas) {
      resolve(canvasToDataUrl(canvas));
    }).catch(function (err) {
      console.error("[Stroll] Iframe screenshot failed:", err);
      resolve("");
    });
  }

  // ── Map elements inside an iframe ──────────────────────────────────────────
  function mapIframeElements(iframe) {
    try {
      var doc = iframe.contentDocument || iframe.contentWindow.document;
      var win = iframe.contentWindow;
      if (!doc) return [];

      var selectors =
        'a, button, input, select, textarea, [role="button"], [role="tab"], [role="link"], [role="menuitem"], [onclick], [tabindex]';
      var allEls = doc.querySelectorAll(selectors);
      var elements = [];

      allEls.forEach(function (el) {
        var rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        var style = win.getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return;

        var label = "";
        if (el.innerText) label = el.innerText.trim().substring(0, 100);
        else if (el.getAttribute("aria-label")) label = el.getAttribute("aria-label");
        else if (el.getAttribute("title")) label = el.getAttribute("title");
        else if (el.getAttribute("placeholder")) label = el.getAttribute("placeholder");

        var type = "action";
        if (el.tagName === "A" || el.getAttribute("role") === "link") type = "nav";
        else if (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA") type = "input";

        elements.push({
          selector: generateSelector(el),
          label: label || "",
          type: type,
          href: el.getAttribute("href") || "",
          bbox: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
        });
      });

      return elements;
    } catch (e) {
      return [];
    }
  }

  // ── Discover links inside an iframe ────────────────────────────────────────
  function discoverIframeLinks(iframe, visited, queue) {
    try {
      var doc = iframe.contentDocument || iframe.contentWindow.document;
      if (!doc) return [];
      var links = [];
      var seen = {};
      doc.querySelectorAll("a[href]").forEach(function (a) {
        var href = a.getAttribute("href");
        if (!href || href.startsWith("#") || href.startsWith("javascript:") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
        var normalized = normalizeUrl(href);
        if (!normalized || seen[normalized]) return;
        if (visited.indexOf(normalized) !== -1 || queue.indexOf(normalized) !== -1) return;
        seen[normalized] = true;
        links.push(normalized);
      });
      return links;
    } catch (e) {
      return [];
    }
  }

  // ── Process the current (host) page first ──────────────────────────────────
  function processHostPage(state, callback) {
    var currentUrl = normalizeUrl(window.location.href);
    state.visited.push(currentUrl);

    console.log("[Stroll] Processing host page:", document.title);

    var elements = mapInteractiveElements();

    loadHtml2Canvas().then(function () {
      captureFullPage().then(function (screenshot) {
        addNode({
          url: window.location.href,
          title: document.title,
          screenshot_base64: screenshot,
          elements: elements,
        });

        // Discover links from host page + sitemap
        fullDiscovery(state).then(function (newLinks) {
          state.queue = state.queue.concat(newLinks);
          if (state.queue.length + state.visited.length > MAX_PAGES) {
            state.queue = state.queue.slice(0, MAX_PAGES - state.visited.length);
          }
          setState(state);

          console.log(
            "[Stroll] Host page captured. " + state.queue.length + " pages queued."
          );

          notifyWidget({
            type: "STROLL_PROGRESS",
            captured: state.visited.length,
            remaining: state.queue.length,
            pageTitle: document.title,
          });

          callback(state);
        });
      });
    });
  }

  // ── Process a page via iframe ──────────────────────────────────────────────
  function processIframePage(url, state, callback) {
    var normalized = normalizeUrl(url);
    if (state.visited.indexOf(normalized) !== -1) {
      callback(state);
      return;
    }

    state.visited.push(normalized);
    setState(state);

    console.log(
      "[Stroll] Loading in iframe (" + state.visited.length + "/" +
        (state.visited.length + state.queue.length) + "):",
      url
    );

    loadInIframe(url).then(function (iframe) {
      var title = "";
      try {
        title = iframe.contentDocument.title || url;
      } catch (e) {
        title = url;
      }

      // Discover more links from this page
      var newLinks = discoverIframeLinks(iframe, state.visited, state.queue);
      if (newLinks.length > 0) {
        state.queue = state.queue.concat(newLinks);
        if (state.queue.length + state.visited.length > MAX_PAGES) {
          state.queue = state.queue.slice(0, MAX_PAGES - state.visited.length);
        }
      }

      var elements = mapIframeElements(iframe);

      captureIframePage(iframe).then(function (screenshot) {
        addNode({
          url: url,
          title: title,
          screenshot_base64: screenshot,
          elements: elements,
        });

        setState(state);

        notifyWidget({
          type: "STROLL_PROGRESS",
          captured: state.visited.length,
          remaining: state.queue.length,
          pageTitle: title,
        });

        console.log(
          "[Stroll] Captured:", title,
          "(" + state.visited.length + " done, " + state.queue.length + " queued)"
        );

        callback(state);
      });
    });
  }

  // ── Crawl loop: process queue one by one via iframe ────────────────────────
  function crawlNext(state) {
    if (state.queue.length === 0) {
      console.log(
        "[Stroll] Crawl complete. " + state.visited.length + " pages captured. Uploading..."
      );
      destroyIframe();
      uploadReport(state);
      return;
    }

    var nextUrl = state.queue.shift();
    setState(state);

    setTimeout(function () {
      processIframePage(nextUrl, state, function (updatedState) {
        crawlNext(updatedState);
      });
    }, NAV_DELAY);
  }

  // ── Main: start or resume crawl ────────────────────────────────────────────
  function main() {
    var state = getState();
    if (!state || !state.active) return;

    // If we have a queue, resume crawling via iframe
    if (state.queue.length > 0) {
      console.log("[Stroll] Resuming crawl: " + state.queue.length + " pages remaining");
      setTimeout(function () {
        crawlNext(state);
      }, SETTLE_DELAY);
    }
  }

  // ── Listen for start commands from widget / cron ─────────────────────────────
  window.addEventListener("message", function (event) {
    var data = event.data;
    if (!data || !data.type) return;

    if (data.type === "STROLL_AUTO_START") {
      // Already active crawl — let it continue
      var existing = getState();
      if (existing && existing.active) return;

      // Check if we already crawled recently (within this session tab)
      // Unless force:true is set (cron re-trigger)
      var doneKey = "__swift_stroll_done_" + data.companyId + "__";
      if (!data.force && sessionStorage.getItem(doneKey)) {
        console.log("[Stroll] Already mapped this session, skipping.");
        return;
      }

      // Clear previous done marker for forced re-crawl
      if (data.force) {
        sessionStorage.removeItem(doneKey);
        clearAll();
      }

      console.log("[Stroll] Starting crawl" + (data.force ? " (forced)" : "") + "...");
      var state = initState(data.companyId, data.baseUrl);
      setState(state);

      // Capture host page first, then crawl remaining pages via iframe
      setTimeout(function () {
        processHostPage(state, function (updatedState) {
          crawlNext(updatedState);
        });
      }, SETTLE_DELAY);
    }
  });

  // ── Recurring crawl scheduler ────────────────────────────────────────────────
  // After a crawl completes, schedule the next one using localStorage
  // (survives tab close, unlike sessionStorage). On each page load the
  // engine checks if it's time for a re-crawl.

  function scheduleCron(companyId, baseUrl) {
    var cronData = {
      companyId: companyId,
      baseUrl: baseUrl,
      nextRunAt: Date.now() + RECRAWL_INTERVAL_MS,
    };
    try {
      localStorage.setItem(CRON_KEY, JSON.stringify(cronData));
    } catch (e) { /* storage full or disabled */ }
  }

  function checkCron() {
    try {
      var raw = localStorage.getItem(CRON_KEY);
      if (!raw) return;
      var cron = JSON.parse(raw);
      if (!cron.companyId || !cron.nextRunAt) return;

      if (Date.now() >= cron.nextRunAt) {
        // Time for a re-crawl — also trigger the backend
        console.log("[Stroll] Cron: time for re-crawl");

        // Trigger the backend stroll run
        fetch(
          cron.baseUrl + "/api/v1/stroll/" + cron.companyId + "/run",
          { method: "POST" }
        ).then(function () {
          console.log("[Stroll] Backend stroll triggered for", cron.companyId);
        }).catch(function () {
          // Not critical — widget crawl still runs
        });

        // Start a fresh widget-side crawl
        window.postMessage({
          type: "STROLL_AUTO_START",
          companyId: cron.companyId,
          baseUrl: cron.baseUrl,
          force: true,
        }, "*");
      }
    } catch (e) { /* ignore */ }
  }

  // Hook into upload success to schedule next crawl
  var _originalUploadReport = uploadReport;
  uploadReport = function (state) {
    // Schedule next crawl after this one uploads
    var origNotify = notifyWidget;
    var scheduled = false;
    notifyWidget = function (data) {
      origNotify(data);
      if (data.type === "STROLL_COMPLETE" && !scheduled) {
        scheduled = true;
        scheduleCron(state.companyId, state.baseUrl);
        console.log(
          "[Stroll] Next crawl scheduled in " +
            (RECRAWL_INTERVAL_MS / 60000) +
            " minutes"
        );
      }
    };
    _originalUploadReport(state);
  };

  // ── Auto-resume on page load ───────────────────────────────────────────────
  if (document.readyState === "complete") {
    main();
    // Check cron after a delay so it doesn't compete with resume
    setTimeout(checkCron, 5000);
  } else {
    window.addEventListener("load", function () {
      main();
      setTimeout(checkCron, 5000);
    });
  }

  notifyWidget({ type: "STROLL_ENGINE_READY" });
})();
