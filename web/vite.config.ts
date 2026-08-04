import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite config. `base: "./"` keeps the build deployable from any sub-path
// (static hosting, GitHub Pages project sites, S3, etc.) without a server.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    // Split large vendor deps into their own chunks so the browser can cache
    // them independently across deploys.
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          router: ["react-router-dom"],
        },
      },
    },
    // The app bundle is ~520 kB (gzip ~142 kB) — mostly the dispute screens +
    // CCIP wallet logic. Raise the threshold above the default 500 kB so the
    // build doesn't warn on a known-good bundle size.
    chunkSizeWarningLimit: 700,
  },
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
