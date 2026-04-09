/**
 * Local dev proxy server for SwiftAgent widget testing.
 *
 * - Serves test.html at http://localhost:3002/
 * - Proxies /api/* → https://api.swiftagents.org/api/*
 *   (adds CORS headers so the browser doesn't block the requests)
 */

import fs from "fs";
import http from "http";
import https from "https";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3002;
const API_TARGET_HOST = "api.swiftagents.org";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  // Proxy /api/* to the real backend
  if (url.pathname.startsWith("/api/")) {
    const proxyOptions = {
      hostname: API_TARGET_HOST,
      port: 443,
      path: url.pathname + url.search,
      method: req.method,
      headers: {
        ...req.headers,
        host: API_TARGET_HOST,
        origin: `https://${API_TARGET_HOST}`,
      },
    };

    const proxyReq = https.request(proxyOptions, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, {
        ...proxyRes.headers,
        ...CORS_HEADERS,
      });
      proxyRes.pipe(res);
    });

    proxyReq.on("error", (err) => {
      console.error(`[PROXY ERROR] ${req.method} ${url.pathname}:`, err.message);
      res.writeHead(502, CORS_HEADERS);
      res.end(JSON.stringify({ error: "Proxy error", detail: err.message }));
    });

    req.pipe(proxyReq);
    return;
  }

  // Serve test.html for / or /test.html
  if (url.pathname === "/" || url.pathname === "/test.html") {
    const filePath = path.join(__dirname, "test.html");
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(data);
    });
    return;
  }

  // Serve /dist/* static files (widget bundle)
  if (url.pathname.startsWith("/dist/")) {
    const filePath = path.join(__dirname, url.pathname);
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, CORS_HEADERS);
        res.end("Not found");
        return;
      }
      res.writeHead(200, {
        "Content-Type": "application/javascript",
        ...CORS_HEADERS,
      });
      res.end(data);
    });
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`\n🚀 Dev proxy running at http://localhost:${PORT}/test.html`);
  console.log(`🔀 Proxying /api/* → https://${API_TARGET_HOST}\n`);
});
