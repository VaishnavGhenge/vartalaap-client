"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { PageLoading } from "@/src/components/ui/PageLoading";
import { safeInternalPath } from "@/src/hooks/use-auth";
import { restoreAuthSession } from "@/src/services/api/auth";
import { useAuthStore } from "@/src/stores/auth";

export default function GoogleAuthCallback() {
    const router = useRouter();
    const started = useRef(false);

    useEffect(() => {
        if (started.current) return;
        started.current = true;
        const next = safeInternalPath(new URLSearchParams(window.location.search).get("next"));
        void restoreAuthSession().then((session) => {
            if (!session) throw new Error("Google sign-in did not create a session");
            useAuthStore.getState().login(session.user);
            const destination = session.user.onboardingStep < 5 && next?.split(/[?#]/)[0] !== "/onboarding"
                ? `/onboarding${next ? `?next=${encodeURIComponent(next)}` : ""}`
                : next ?? "/dashboard";
            router.replace(destination);
        }).catch(() => {
            router.replace("/login?oauth=failed");
        });
    }, [router]);

    return <PageLoading layout="login" label="Finishing Google sign-in…" />;
}
