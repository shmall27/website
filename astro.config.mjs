import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";

import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
  integrations: [mdx()],
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