import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN && process.env.NODE_ENV !== 'development',
  tracesSampleRate: 0.2,
  // Microsoft's Outlook/Defender Safe Links scanner opens emailed links in a headless
  // browser that rejects this from its own injected bridge; it never comes from our code.
  ignoreErrors: [/Object Not Found Matching Id:\d+, MethodName:\w+, ParamCount:\d+/],
  integrations: [
    Sentry.captureConsoleIntegration({ levels: ['error'] }),
  ],
})
