import type { NextConfig } from "next";

const SECURITY_HEADERS: ReadonlyArray<{ key: string; value: string }> = [
  // Force HTTPS for two years, including subdomains.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // Prevent MIME-type sniffing.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Disallow embedding the app in iframes (clickjacking protection).
  { key: "X-Frame-Options", value: "DENY" },
  // Only send the origin as referrer on cross-origin requests.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Lock down powerful browser features we never use.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  experimental: {
    turbopackUseSystemTlsCerts: true,
  },
  async redirects() {
    // Canonical host is the apex joingridlock.com. Redirect the www subdomain
    // to it so SEO + cookies stay consolidated on one origin.
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.joingridlock.com" }],
        destination: "https://joingridlock.com/:path*",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [...SECURITY_HEADERS],
      },
    ];
  },
};

export default nextConfig;
