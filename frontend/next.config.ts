import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The dashboard talks to the Express API directly from the browser; nothing is
  // proxied or rendered on a server, so there is no server-side secret to protect.
  poweredByHeader: false,
  typedRoutes: false,
  /**
   * Next 16 blocks cross-origin requests for dev resources by default, and it treats
   * `127.0.0.1` and `localhost` as different origins. Since the API base URL this
   * project ships is `http://127.0.0.1:4300`, opening the dashboard on `127.0.0.1:4200`
   * is the natural thing to do — and it silently breaks: the HMR socket and the client
   * chunks get blocked, the app never hydrates, and the page sits on skeletons forever
   * with no error in the UI. Allowing both spellings of loopback avoids that trap.
   */
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
};

export default nextConfig;
