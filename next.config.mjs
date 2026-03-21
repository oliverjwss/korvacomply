/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: "/dashboard",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'self' https://*.zendesk.com https://*.zdassets.com",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
