/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn-old.brawlify.com",
      },
      {
        protocol: "https",
        hostname: "cdn.brawlify.com",
      },
    ],
  },
};

module.exports = nextConfig;
