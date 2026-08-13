import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The dashboard talks to the Express API directly from the browser; nothing is
  // proxied or rendered on a server, so there is no server-side secret to protect.
  poweredByHeader: false,
  typedRoutes: false,
};

export default nextConfig;
