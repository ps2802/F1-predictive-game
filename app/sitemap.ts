import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [
    {
      url: "https://joingridlock.com",
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: "https://joingridlock.com/leaderboard",
      lastModified,
      changeFrequency: "weekly",
      priority: 0.8,
    },
  ];
}
