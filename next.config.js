/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  serverRuntimeConfig: {
    // Only available on the server side
    databaseUrl: process.env.DATABASE_URL,
  },
  publicRuntimeConfig: {
    // Will be available on both server and client
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
  },
}

module.exports = nextConfig
