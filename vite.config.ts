import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import cssInjectedByJsPlugin from "vite-plugin-css-injected-by-js";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    cssInjectedByJsPlugin({
      // Don't auto-inject into <head> — we'll inject into Shadow DOM manually
      injectCodeFunction: (css) => {
        (window as unknown as Record<string, unknown>).__SWIFT_WIDGET_CSS__ =
          css;
      },
    }),
  ],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    "process.env": JSON.stringify({}),
  },
  build: {
    lib: {
      entry: "src/main.tsx",
      name: "SwiftAgentWidget",
      fileName: () => "widget-ui.js",
      formats: ["iife"],
    },
    rollupOptions: {
      // Bundle everything — no externals — must be fully self-contained
      external: [],
    },
    // Single output file, no chunk splitting
    cssCodeSplit: false,
    assetsInlineLimit: 10 * 1024 * 1024, // Inline audio files as base64 data URIs
    commonjsOptions: { transformMixedEsModules: true },
    outDir: "dist",
    emptyOutDir: true,
  },
});
