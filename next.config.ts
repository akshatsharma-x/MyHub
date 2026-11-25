import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Frontend-only: no API routes, no server data. The archive is a static
  // JSON module compiled into the bundle by the build-time ETL in tools/.
  reactStrictMode: true,
};

export default nextConfig;
