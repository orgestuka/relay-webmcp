import { defineConfig } from "vite";

const originIsolationHeaders = {
  "Origin-Agent-Cluster": "?1",
};

export default defineConfig({
  server: {
    strictPort: true,
    headers: originIsolationHeaders,
  },
  preview: {
    strictPort: true,
    headers: originIsolationHeaders,
  },
  build: {
    target: "es2022",
  },
});
