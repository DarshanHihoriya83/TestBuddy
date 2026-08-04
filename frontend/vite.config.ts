import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // Force browser bundle — Node entry breaks Vite import analysis
      exceljs: path.resolve(root, "node_modules/exceljs/dist/exceljs.min.js"),
    },
  },
  optimizeDeps: {
    include: ["exceljs"],
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8080",
    },
  },
});
