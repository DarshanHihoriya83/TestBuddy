import { defineConfig, build as viteBuild } from "vite";
import react from "@vitejs/plugin-react";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { resolve } from "node:path";

function buildContentScriptPlugin() {
  let buildingContent = false;
  return {
    name: "build-content-script",
    async closeBundle() {
      if (buildingContent) return;
      buildingContent = true;
      try {
        await viteBuild({
          configFile: resolve(__dirname, "vite.content.config.ts"),
        });
      } finally {
        buildingContent = false;
      }
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    viteStaticCopy({
      targets: [{ src: "public/manifest.json", dest: "." }],
    }),
    buildContentScriptPlugin(),
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "popup.html"),
        background: resolve(__dirname, "src/background.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
