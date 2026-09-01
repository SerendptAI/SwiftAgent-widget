import axios from "axios";

/**
 * Creates an axios client for calling the SwiftAgent API routes.
 * baseUrl is injected at mount time from the widget.js loader script.
 */
let _baseUrl = import.meta.env.VITE_API_BASE_URL ?? "";
let _apiKey = import.meta.env.VITE_API_KEY ?? "";

export function setBaseUrl(url: string) {
  _baseUrl = url.replace(/\/$/, "");
  localApiClient.defaults.baseURL = _baseUrl;
}

export function getBaseUrl() {
  return _baseUrl;
}

/**
 * Widget API key, supplied by the host page at mount time. Sent as the
 * `X-API-Key` header on the authenticated chat/upload endpoints.
 */
export function setApiKey(key: string) {
  _apiKey = key;
}

export function getApiKey() {
  return _apiKey;
}

/** `X-API-Key` header for the authenticated endpoints; empty when no key was supplied. */
export function apiKeyHeaders(): Record<string, string> {
  const key = getApiKey();
  return key ? { "X-API-Key": key } : {};
}

/** Base URL that goes through the local proxy server (avoids CORS issues) */
export function getProxyBaseUrl() {
  return import.meta.env.VITE_VOICE_API_URL ?? "";
}

/** Client for calling the SwiftAgent backend API */
export const localApiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "",
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
export function initApiClients(baseUrl: string, apiKey?: string) {
  const cleanBase = baseUrl.replace(/\/$/, "");

  // Env var takes priority over the script-tag key so local dev can override it.
  if (!import.meta.env.VITE_API_KEY && apiKey) {
    _apiKey = apiKey;
  }

  // Env vars take priority over the script-tag base URL for their respective clients
  if (!import.meta.env.VITE_API_BASE_URL) {
    _baseUrl = cleanBase;
    localApiClient.defaults.baseURL = cleanBase;
  }

  // Voice client always falls back to the widget base URL when no env var is set
  if (!import.meta.env.VITE_VOICE_API_URL) {
    voiceApiClient.defaults.baseURL = cleanBase;
  }
}
