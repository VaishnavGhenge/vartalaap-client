"use client";

import Link from "next/link";
import { useState } from "react";
import { BufferingButtonLabel } from "@/src/components/ui/BufferingButtonLabel";
import { Input } from "@/src/components/ui/input";
import { Button } from "@/src/components/ui/button";
import { SessionlyBrand } from "@/src/components/ui/SessionlyBrand";
import { ThemeToggle } from "@/src/components/ui/ThemeToggle";
import { useLogin } from "@/src/hooks/use-auth";

export default function Login() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const { mutate: login, isPending } = useLogin();

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        login({ email, password });
    }

    return (
        <div className="relative flex min-h-dvh flex-col">
            <div className="absolute right-4 top-4 z-10">
                <ThemeToggle />
            </div>

            <main className="flex flex-1 flex-col items-center justify-center px-4 py-12 sm:px-6">
                <Link href="/" className="mb-8">
                    <SessionlyBrand size="lg" />
                </Link>

                <div className="app-panel w-full max-w-sm rounded-2xl p-6 sm:p-8">

                    <h1 className="text-xl font-semibold tracking-tight text-[hsl(var(--foreground))]">
                        Sign in
                    </h1>
                    <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                        Continue to Sessionly
                    </p>

                    <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="email" className="label-caps">Email</label>
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
                            <label htmlFor="password" className="label-caps">Password</label>
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

                        <Button type="submit" size="lg" className="mt-1 w-full" disabled={isPending}>
                            {isPending
                                ? <BufferingButtonLabel label="Signing in…" />
                                : "Sign in"
                            }
                        </Button>
                    </form>

                    <p className="mt-6 text-center text-xs text-[hsl(var(--muted-foreground))]">
                        No account?{" "}
                        <Link href="/register" className="link" prefetch>
                            Register
                        </Link>
                    </p>
                </div>
            </main>
        </div>
    );
}
