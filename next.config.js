/** @type {import('next').NextConfig} */
const nextConfig = {
    env: {
      PROD_SERVER: process.env.PROD_SERVER || 'localhost:8080',
    },
}

module.exports = nextConfig
