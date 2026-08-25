import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * Pin the workspace root. Without this the build walks up past
   * the repository and picks up an unrelated lockfile.
   */
  turbopack: {
    root: path.resolve(import.meta.dirname),
  },

  /*
   * No value in advertising the framework version.
   */
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            /*
             * The scanner needs the camera; nothing else here
             * needs any of these capabilities.
             */
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=()",
          },
        ],
      },
      {
        /*
         * Registration and distribution data must never be held
         * by a shared cache.
         */
        source: "/api/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, max-age=0",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
