"use client";

import Navbar from "@/src/components/ui/Navbar";
import Link from "next/link";
import { BufferingButtonLabel } from "@/src/components/ui/BufferingButtonLabel";
import { Input } from "@/src/components/ui/input";
import { Button } from "@/src/components/ui/button";

export default function Login() {
    return (
        <div className="flex min-h-dvh flex-col">
            <Navbar />

            <main className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6">
                <div className="app-panel w-full max-w-sm rounded-2xl p-6 sm:p-8">

                    <h1 className="text-xl font-semibold tracking-tight text-[hsl(var(--foreground))]">
                        Sign in
                    </h1>
                    <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                        Continue to Vartalaap
                    </p>

                    <form className="mt-6 flex flex-col gap-4">
                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="email" className="label-caps">Email</label>
                            <Input
                                type="email"
                                id="email"
                                name="email"
                                placeholder="you@example.com"
                                autoComplete="email"
                            />
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="password" className="label-caps">Password</label>
                            <Input
                                type="password"
                                id="password"
                                name="password"
                                autoComplete="current-password"
                            />
                        </div>

                        <Button type="button" size="lg" className="mt-1 w-full">
                            <BufferingButtonLabel label="Signing in…" />
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
