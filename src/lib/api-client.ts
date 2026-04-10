import axios from "axios";

/**
 * Creates an axios client for calling the SwiftAgent API routes.
 * baseUrl is injected at mount time from the widget.js loader script.
 */
let _baseUrl = import.meta.env.VITE_VOICE_API_URL ?? import.meta.env.VITE_API_BASE_URL ?? "";

export function setBaseUrl(url: string) {
  _baseUrl = url.replace(/\/$/, "");
  localApiClient.defaults.baseURL = _baseUrl;
}

export function getBaseUrl() {
  return _baseUrl;
}

/** Base URL that goes through the local proxy server (avoids CORS issues) */
export function getProxyBaseUrl() {
  return import.meta.env.VITE_VOICE_API_URL ?? "";
}

/** Client for calling API routes — uses proxy server in dev to avoid CORS */
export const localApiClient = axios.create({
  baseURL: import.meta.env.VITE_VOICE_API_URL ?? import.meta.env.VITE_API_BASE_URL ?? "",
  timeout: 30_000,
});

/** Client for STT/TTS calls — points to the voice proxy server, not the main API */
export const voiceApiClient = axios.create({
  baseURL: import.meta.env.VITE_VOICE_API_URL ?? "",
  timeout: 30_000,
});

/** Client for calling the public backend API directly */
export const publicApiClient = axios.create({
  headers: { "Content-Type": "application/json" },
  timeout: 10_000,
});

/**
 * Initialize both clients with the correct base URLs.
 * Called once from main.tsx when the widget mounts.
 */
export function initApiClients(baseUrl: string) {
  // Env var takes priority over the script-tag base URL
  if (import.meta.env.VITE_API_BASE_URL) return;

  const cleanBase = baseUrl.replace(/\/$/, "");
  _baseUrl = cleanBase;
  localApiClient.defaults.baseURL = cleanBase;
}
