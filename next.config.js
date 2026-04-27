const { withSentryConfig } = require('@sentry/nextjs')

/** @type {import('next').NextConfig} */
const nextConfig = {}

module.exports = withSentryConfig(nextConfig, {
  silent: true,
  // Upload source maps only when DSN is present (i.e. production builds).
  // Set SENTRY_AUTH_TOKEN + SENTRY_ORG + SENTRY_PROJECT to enable uploads.
  sourcemaps: {
    disable: !process.env.NEXT_PUBLIC_SENTRY_DSN,
  },
  telemetry: false,
})
