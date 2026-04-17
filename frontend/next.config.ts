import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow fetching from the FastAPI backend during development.
  // /api proxies the JSON API; /uploads proxies the receipt static files
  // so the <img src="/uploads/receipts/..."> tag in the submission form
  // resolves cleanly without a hardcoded backend host.
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:8000/api/:path*",
      },
      {
        source: "/uploads/:path*",
        destination: "http://localhost:8000/uploads/:path*",
      },
      {
        source: "/health",
        destination: "http://localhost:8000/health",
      },
    ];
  },
};

export default nextConfig;
