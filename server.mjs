/**
 * Lightweight proxy server for ElevenLabs STT & TTS.
 *
 * Keeps the API key server-side and exposes:
 *   POST /api/v1/stt   – speech-to-text  (multipart: audio file)
 *   POST /api/v1/tts   – text-to-speech  (JSON: { text })
 *
 * Also proxies all other /api/* requests to the SwiftAgent backend.
 *
 * Env vars (via .env):
 *   ELEVENLABS_API_KEY   – required
 *   ELEVENLABS_VOICE_ID  – optional (default: JBFqnCBsd6RMkjVDRZzb)
 *   PORT                 – optional (default: 3002)
 */

import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import https from "https";
import path from "path";
import { fileURLToPath } from "url";
import { Readable } from "stream";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 3002;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID =
  process.env.ELEVENLABS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb";
const API_TARGET_HOST = "api.swiftagents.org";

// Reuse TLS connections across proxy requests
const proxyAgent = new https.Agent({ keepAlive: true });

if (!ELEVENLABS_API_KEY) {
  console.error("❌  ELEVENLABS_API_KEY is not set in .env");
  process.exit(1);
}

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());

// --- Static files (before API routes so they're served directly) ---

app.get(["/", "/test.html"], (_req, res) => {
  res.sendFile(path.join(__dirname, "test.html"));
});

app.use("/dist", express.static(path.join(__dirname, "dist")));
app.use("/public", express.static(path.join(__dirname, "public")));

// --- STT endpoint ---

app.post("/api/v1/stt", upload.single("audio"), async (req, res) => {
  try {
    console.log("[STT] file:", req.file ? `${req.file.originalname} (${req.file.mimetype}, ${req.file.buffer.length} bytes)` : "MISSING");

    if (!req.file) {
      return res.status(400).json({ error: "Missing audio file" });
    }

    // Build a proper FormData for ElevenLabs
    const body = new FormData();
    body.append(
      "file",
      new Blob([req.file.buffer], { type: req.file.mimetype }),
      req.file.originalname || "audio.webm",
    );
    body.append("model_id", "scribe_v1");
    body.append("language_code", "en");

    const response = await fetch(
      "https://api.elevenlabs.io/v1/speech-to-text",
      {
        method: "POST",
        headers: { "xi-api-key": ELEVENLABS_API_KEY },
        body,
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("ElevenLabs STT error:", response.status, errorText);
      return res.status(response.status).json({ error: "Speech-to-text failed" });
    }

    const result = await response.json();
    res.json({ text: result.text ?? "" });
  } catch (err) {
    console.error("STT error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- TTS endpoint ---

app.post("/api/v1/tts", express.json(), async (req, res) => {
  const { text } = req.body;

  if (!text || typeof text !== "string") {
    return res.status(400).json({ error: "Missing text field" });
  }

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}/stream?output_format=mp3_22050_32&optimize_streaming_latency=4`,
      {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_turbo_v2_5",
          voice_settings: { stability: 0.7, similarity_boost: 0.8 },
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("ElevenLabs TTS error:", response.status, errorText);
      return res.status(response.status).json({ error: "TTS generation failed" });
    }

    res.set({
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-cache",
    });

    // Pipe the web ReadableStream to the Express response with back-pressure.
    Readable.fromWeb(response.body).pipe(res);
  } catch (err) {
    console.error("TTS error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Stream-pipe all /api/* requests to the backend. Body is streamed without
// buffering, so large payloads (e.g. stroll reports with screenshots) don't
// double-allocate.
app.all("/api/{*splat}", (req, res) => {
  const proxyReq = https.request({
    agent: proxyAgent,
    hostname: API_TARGET_HOST,
    port: 443,
    path: req.originalUrl,
    method: req.method,
    headers: {
      ...req.headers,
      host: API_TARGET_HOST,
      origin: `https://${API_TARGET_HOST}`,
    },
  }, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on("error", (err) => {
    console.error(`[PROXY ERROR] ${req.method} ${req.originalUrl}:`, err.message);
    res.status(502).json({ error: "Proxy error", detail: err.message });
  });

  req.pipe(proxyReq);
});

// --- Start ---

app.listen(PORT, () => {
  console.log(`\n🚀 Server running at http://localhost:${PORT}/test.html`);
  console.log(`🎤 STT → POST /api/v1/stt`);
  console.log(`🔊 TTS → POST /api/v1/tts`);
  console.log(`🚶 Stroll → POST /api/v1/public/stroll/:id/report`);
  console.log(`🔀 Other /api/* → https://${API_TARGET_HOST}\n`);
});
