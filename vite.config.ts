import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { chunballPwa } from "./scripts/pwa.mjs";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [chunballPwa()],
  server: {
    host: true,
    port: 5173,
    allowedHosts: true,
  },
  preview: {
    host: true,
    allowedHosts: true,
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(root, "index.html"),
      },
    },
  },
});
