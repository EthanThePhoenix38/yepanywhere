import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    conditions: ["source"],
  },
  server: {
    port: 5555, // also referenced in root package.json dev-tailscale script
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://localhost:3400",
        changeOrigin: true,
      },
    },
  },
});
