/** The embed tag the widget is loaded from; its `src` locates sibling assets. */
export const WIDGET_SCRIPT_SELECTOR = "script[data-company-id]";

function resolveAssetBaseUrl(): string {
  const script =
    (document.currentScript as HTMLScriptElement | null) ??
    document.querySelector<HTMLScriptElement>(WIDGET_SCRIPT_SELECTOR);
  const src = script?.getAttribute("src");
  if (!src) return "";
  try {
    return new URL(".", new URL(src, window.location.href)).href;
  } catch {
    return "";
  }
}

// Resolved at module scope, while `document.currentScript` still points at our
// own tag — it is null by the time React renders.
const assetBaseUrl = resolveAssetBaseUrl();

/**
 * Absolute URL of a file shipped next to widget-ui.js. Host pages embed the
 * widget cross-origin, so these cannot be page-relative. Falls back to the bare
 * name when the embed tag can't be found, leaving the browser to resolve it.
 */
export function widgetAssetUrl(fileName: string): string {
  return assetBaseUrl ? new URL(fileName, assetBaseUrl).href : fileName;
}
