import fs from "node:fs";
import { createRequire } from "node:module";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import cssInjectedByJsPlugin from "vite-plugin-css-injected-by-js";

const require = createRequire(import.meta.url);

/**
 * Ship Rive's WASM next to the bundle under a stable name, so BriggsFace can
 * point RuntimeLoader at it instead of `?url`-importing it — that inlined 2.4MB
 * of base64 into widget-ui.js and delayed the launcher on every host page.
 * Sourced from node_modules so it cannot drift from the installed runtime.
 */
function emitRiveWasm(): Plugin {
  return {
    name: "emit-rive-wasm",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "rive.wasm",
        source: fs.readFileSync(require.resolve("@rive-app/canvas/rive.wasm")),
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    emitRiveWasm(),
    cssInjectedByJsPlugin({
      // Don't auto-inject into <head> — we'll inject into Shadow DOM manually
      injectCodeFunction: (css) => {
        (window as unknown as Record<string, unknown>).__SWIFT_WIDGET_CSS__ =
          css;
      },
    }),
  ],
  assetsInclude: ["**/*.riv"],
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
