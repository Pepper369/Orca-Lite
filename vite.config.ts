import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    "process.env": {},
    process: { env: {} },
    global: "globalThis",
  },
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "next/link": path.resolve(__dirname, "./src/lib/shims/next-link.tsx"),
      "next/navigation": path.resolve(__dirname, "./src/lib/shims/next-navigation.tsx"),
      "next/dynamic": path.resolve(__dirname, "./src/lib/shims/next-dynamic.tsx"),
      "next/image": path.resolve(__dirname, "./src/lib/shims/next-image.tsx"),
      "next/server": path.resolve(__dirname, "./src/lib/shims/next-server.ts"),
      "next/headers": path.resolve(__dirname, "./src/lib/shims/next-headers.ts"),
      "next/og": path.resolve(__dirname, "./src/lib/shims/next-og.ts"),
      "next": path.resolve(__dirname, "./src/lib/shims/next-types.ts"),
    },
  },
  server: {
    port: 5173,
    host: "0.0.0.0",
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    target: "esnext",
    sourcemap: false,
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("lightweight-charts")) return "charts";
          if (id.includes("lucide-react")) return "icons";
          if (id.includes("@duckdb") || id.includes("apache-arrow")) return "duckdb";
        },
      },
    },
  },
  optimizeDeps: {
    exclude: ["@duckdb/duckdb-wasm"],
  },
});
