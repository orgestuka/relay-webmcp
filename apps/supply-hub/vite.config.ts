import { defineConfig } from "vite";

const webMcpHeaders = {
  "Origin-Agent-Cluster": "?1",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), tools=*",
};

export default defineConfig({
  server: {
    strictPort: true,
    headers: webMcpHeaders,
  },
  preview: {
    strictPort: true,
    headers: webMcpHeaders,
  },
  build: {
    target: "es2022",
  },
});
