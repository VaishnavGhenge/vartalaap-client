"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export function SentryInit() {
    useEffect(() => {
        if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
        if (Sentry.getClient()) return;
        Sentry.init({
            dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
            tracesSampleRate: 0.2,
            integrations: [
                Sentry.captureConsoleIntegration({ levels: ["error", "warn"] }),
            ],
        });
    }, []);
    return null;
}
