/** @type {import('next').NextConfig} */
const frameAncestorsCsp =
  "frame-ancestors 'self' https://*.zendesk.com https://*.zdassets.com";

const nextConfig = {
  async headers() {
    return [
      // Apply to every route so Zendesk can iframe /dashboard, /zendesk/sidebar,
      // and avoids X-Frame-Options / missing CSP on / blocking the background app.
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: frameAncestorsCsp,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
