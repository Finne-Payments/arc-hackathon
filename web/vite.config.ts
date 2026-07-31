import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite config. `base: "./"` keeps the build deployable from any sub-path
// (static hosting, GitHub Pages project sites, S3, etc.) without a server.
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      // Proxy API calls to the backend (PRD §7.2). Rewrite strips /api.
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  preview: {
    port: 4173,
    host: true,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
