const { withSentryConfig } = require('@sentry/nextjs')

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    if (process.env.NEXT_PUBLIC_AUTH_SAME_ORIGIN !== 'true') return []
    const protocol = process.env.NEXT_PUBLIC_SERVER_SECURE === 'true' ? 'https' : 'http'
    const domain = process.env.NEXT_PUBLIC_SERVER_DOMAIN || 'localhost:8080'
    return [{ source: '/auth/:path*', destination: `${protocol}://${domain}/auth/:path*` }]
  },
}

module.exports = withSentryConfig(nextConfig, {
  silent: true,
  // Upload source maps only when DSN is present (i.e. production builds).
  // Set SENTRY_AUTH_TOKEN + SENTRY_ORG + SENTRY_PROJECT to enable uploads.
  sourcemaps: {
    disable: !process.env.NEXT_PUBLIC_SENTRY_DSN,
  },
  telemetry: false,
})
