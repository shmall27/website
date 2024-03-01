import { z, defineCollection } from "astro:content";

const blogSchema = z.object({
  title: z.string(),
  date: z.date(),
  subtitle: z.string(),
  series: z.string().optional(),
  issue: z.number().optional(),
  tags: z.array(z.string()).optional(),
});

const blogCollection = defineCollection({
  type: "content",
  schema: blogSchema,
});

export type BlogPost = z.infer<typeof blogSchema>;

export const collections = {
  blog: blogCollection,
};
