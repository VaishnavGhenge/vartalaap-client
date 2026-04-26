"use client";

import { BufferingButtonLabel } from "@/src/components/ui/BufferingButtonLabel";
import Link from "next/link";
import { useState } from "react";
import Navbar from "@/src/components/ui/Navbar";
import { Input } from "@/src/components/ui/input";
import { Button } from "@/src/components/ui/button";

export default function Register() {
    const [isRegisterPending, setIsRegisterPending] = useState(false);

    return (
        <div className="flex min-h-dvh flex-col">
            <Navbar />

            <main className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6">
                <div className="app-panel w-full max-w-sm sm:max-w-md rounded-2xl p-6 sm:p-8">

                    <h1 className="text-xl font-semibold tracking-tight text-[hsl(var(--foreground))]">
                        Create account
                    </h1>
                    <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                        Join Vartalaap
                    </p>

                    <form className="mt-6 flex flex-col gap-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="flex flex-col gap-1.5">
                                <label htmlFor="firstName" className="label-caps">
                                    First name
                                </label>
                                <Input
                                    type="text"
                                    id="firstName"
                                    name="firstName"
                                    autoComplete="given-name"
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label htmlFor="lastName" className="label-caps">
                                    Last name
                                </label>
                                <Input
                                    type="text"
                                    id="lastName"
                                    name="lastName"
                                    autoComplete="family-name"
                                />
                            </div>
                        </div>

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
                            <label htmlFor="password" className="label-caps">
                                Password <span className="normal-case tracking-normal font-normal opacity-60">(min 8 chars)</span>
                            </label>
                            <Input
                                type="password"
                                id="password"
                                name="password"
                                autoComplete="new-password"
                                minLength={8}
                            />
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="password2" className="label-caps">Confirm password</label>
                            <Input
                                type="password"
                                id="password2"
                                name="password2"
                                autoComplete="new-password"
                            />
                        </div>

                        <Button
                            type="button"
                            size="lg"
                            className="mt-1 w-full"
                            disabled={isRegisterPending}
                        >
                            {isRegisterPending
                                ? <BufferingButtonLabel label="Creating account…" />
                                : "Create account"
                            }
                        </Button>
                    </form>

                    <p className="mt-6 text-center text-xs text-[hsl(var(--muted-foreground))]">
                        Already have an account?{" "}
                        <Link href="/login" className="link" prefetch>
                            Sign in
                        </Link>
                    </p>
                </div>
            </main>
        </div>
    );
}
