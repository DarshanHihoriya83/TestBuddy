import { defineConfig } from "vite";
import { resolve } from "node:path";

// Content scripts injected via chrome.scripting.executeScript must be a single classic file.
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, "src/content/recorder.ts"),
      name: "ReproScribeRecorder",
      formats: ["iife"],
      fileName: () => "content",
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        entryFileNames: "content.js",
      },
    },
  },
});
