import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev-only proxies. In production the frontend hits the backend
  // directly via NEXT_PUBLIC_API_URL — the rewrites would otherwise
  // try to proxy to localhost:8000 which doesn't exist on Railway.
  async rewrites() {
    if (process.env.NODE_ENV === "production") return [];
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
  // Allow Next/Image to load receipt thumbnails from the backend host.
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.up.railway.app",
      },
      {
        protocol: "http",
        hostname: "localhost",
      },
    ],
  },
};

export default nextConfig;
