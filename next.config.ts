import type { NextConfig } from "next";

// GitHub Pages hosts this as a static export under /<repo>/. The deploy
// workflow sets PAGES_BASE_PATH (from actions/configure-pages) to switch that
// build on. Without it — `next dev`, `next start`, the audit suite — the app
// builds exactly as it always has, at the root.
const pagesBasePath = process.env.PAGES_BASE_PATH;

const nextConfig: NextConfig = {
  // Frontend-only: no API routes, no server data. The archive is a static
  // JSON module compiled into the bundle by the build-time ETL in tools/.
  reactStrictMode: true,
  ...(pagesBasePath !== undefined && {
    output: "export",
    basePath: pagesBasePath,
    // <Link> and the router add the base path themselves. This is for the one
    // navigation that cannot use them: global-error's full reload.
    env: { NEXT_PUBLIC_BASE_PATH: pagesBasePath },
  }),
};

export default nextConfig;
