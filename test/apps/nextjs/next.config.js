/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    instrumentationClientRouterTransitionEvents: true,
  },
  turbopack: {
    root: __dirname,
  },
}

module.exports = nextConfig
