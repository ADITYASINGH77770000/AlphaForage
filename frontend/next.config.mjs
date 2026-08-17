/** @type {import('next').NextConfig} */

// The Python FastAPI service. Override with API_URL when deploying.
const API_URL = process.env.API_URL ?? "http://127.0.0.1:8000";

const nextConfig = {
  reactStrictMode: true,
  // Proxy API calls to the Python backend so the browser stays same-origin
  // (no CORS preflight, and no API host baked into the client bundle).
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/api/:path*` }];
  },
};

export default nextConfig;
