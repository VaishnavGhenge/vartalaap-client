"use client";

import { useState } from "react";

import { safeNextPath } from "@/src/hooks/use-auth";
import { startGoogleSignIn } from "@/src/services/api/auth";
import { Button } from "@/src/components/ui/button";
import { BufferingButtonLabel } from "@/src/components/ui/BufferingButtonLabel";
import { FormError } from "@/src/components/ui/FormError";

function oauthErrorMessage(): string | null {
    if (typeof window === "undefined") return null;
    switch (new URLSearchParams(window.location.search).get("oauth")) {
        case "denied": return "Google sign-in was cancelled.";
        case "invalid_state": return "That Google sign-in attempt expired. Please try again.";
        case "account_conflict": return "This account is already linked to a different Google account.";
        case "failed": return "Google sign-in could not be completed. Please try again.";
        default: return null;
    }
}

export function GoogleSignInButton() {
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(oauthErrorMessage);

    async function start() {
        setPending(true);
        setError(null);
        try {
            window.location.assign(await startGoogleSignIn(safeNextPath()));
        } catch (e) {
            setError(e instanceof Error ? e.message : "Google sign-in is unavailable right now.");
            setPending(false);
        }
    }

    return (
        <div className="mt-6">
            <Button type="button" variant="outline" size="lg" className="w-full" disabled={pending} onClick={() => void start()}>
                {pending ? <BufferingButtonLabel label="Opening Google…" /> : (
                    <><span aria-hidden className="mr-2 flex size-5 items-center justify-center rounded-full border border-[hsl(var(--border))] text-xs font-semibold">G</span>Continue with Google</>
                )}
            </Button>
            <FormError>{error}</FormError>
            <div className="my-5 flex items-center gap-3" aria-hidden>
                <span className="h-px flex-1 bg-[hsl(var(--border))]" />
                <span className="text-xs text-[hsl(var(--muted-foreground))]">or continue with email</span>
                <span className="h-px flex-1 bg-[hsl(var(--border))]" />
            </div>
        </div>
    );
}
