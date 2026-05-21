import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";

import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
  site: "https://samhall.io",
  integrations: [mdx(), sitemap()],
  markdown: {
    shikiConfig: {
      theme: "monokai",
      langs: ["rust"],
      wrap: true,
      transformers: []
    }
  },
  output: "server",
  adapter: cloudflare()
});