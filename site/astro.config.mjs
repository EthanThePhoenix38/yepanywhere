import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://yepanywhere.com",
  integrations: [sitemap()],
  server: {
    port: 3000,
    host: true,
  },
});
