import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const usePolling = process.env.CODEX_SANDBOX === "seatbelt";

export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    watch: usePolling ? { usePolling: true } : undefined,
  },
  preview: {
    host: "127.0.0.1",
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
