import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/"],
        // Block auth pages, user-specific routes, and API endpoints from indexing
        disallow: ["/dashboard", "/predict/", "/login", "/signup", "/api/"],
      },
    ],
    sitemap: "https://joingridlock.com/sitemap.xml",
    host: "https://joingridlock.com",
  };
}
