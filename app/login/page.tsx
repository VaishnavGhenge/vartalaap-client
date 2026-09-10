"use client";

import Link from "next/link";
import { useState } from "react";
import { BufferingButtonLabel } from "@/src/components/ui/BufferingButtonLabel";
import { Input } from "@/src/components/ui/input";
import { Button } from "@/src/components/ui/button";
import { AuthShell } from "@/src/components/ui/AuthShell";
import { PageLoading } from "@/src/components/ui/PageLoading";
import { FormError } from "@/src/components/ui/FormError";
import { useLogin, safeNextPath, useAuthRedirect } from "@/src/hooks/use-auth";
import { useAuthStore } from "@/src/stores/auth";

export default function Login() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const { isAuthenticated, isLoading } = useAuthStore();
    useAuthRedirect();
    const { mutate: login, isPending, error } = useLogin();

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        login({ email, password });
    }

    if (isLoading || isAuthenticated)
        return <PageLoading layout="login" label={isLoading ? "Checking your session…" : "Opening your workspace…"} />;

    return (
        <AuthShell title="Welcome back." description="Sign in to manage your bookings and join your sessions.">
            <form onSubmit={handleSubmit} aria-busy={isPending} className="mt-6 flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                    <label htmlFor="email" className="label-caps">
                        Email
                    </label>
                    <Input
                        type="email"
                        id="email"
                        name="email"
                        placeholder="you@example.com"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                </div>

                <div className="flex flex-col gap-1.5">
                    <label htmlFor="password" className="label-caps">
                        Password
                    </label>
                    <Input
                        type="password"
                        id="password"
                        name="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />
                </div>

                <FormError>{error?.message}</FormError>
                <Button type="submit" size="lg" className="mt-1 w-full" disabled={isPending}>
                    {isPending ? <BufferingButtonLabel label="Signing in…" /> : "Sign in"}
                </Button>
            </form>

            <p className="mt-6 text-center text-xs text-[hsl(var(--muted-foreground))]">
                No account?{" "}
                <Link
                    href={safeNextPath() ? `/register?next=${encodeURIComponent(safeNextPath()!)}` : "/register"}
                    className="link"
                    prefetch
                >
                    Create your free account
                </Link>
            </p>
        </AuthShell>
    );
}
