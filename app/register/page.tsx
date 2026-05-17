"use client";

import { BufferingButtonLabel } from "@/src/components/ui/BufferingButtonLabel";
import Link from "next/link";
import { useState } from "react";
import { Input } from "@/src/components/ui/input";
import { Button } from "@/src/components/ui/button";
import { SessionlyBrand } from "@/src/components/ui/SessionlyBrand";
import { useRegister } from "@/src/hooks/use-auth";
import { toast } from "sonner";

export default function Register() {
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const { mutate: registerUser, isPending } = useRegister();

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (password !== confirmPassword) {
            toast.error("Passwords don't match");
            return;
        }
        registerUser({
            name: `${firstName.trim()} ${lastName.trim()}`.trim(),
            email,
            password,
        });
    }

    return (
        <div className="relative flex min-h-dvh flex-col">
            <main className="flex flex-1 flex-col items-center justify-center px-4 py-12 sm:px-6">
                <Link href="/" className="mb-8">
                    <SessionlyBrand size="lg" />
                </Link>

                <div className="app-panel w-full max-w-sm sm:max-w-md rounded-2xl p-6 sm:p-8">

                    <h1 className="text-xl font-semibold tracking-tight text-[hsl(var(--foreground))]">
                        Create account
                    </h1>
                    <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                        Join Sessionly
                    </p>

                    <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="flex flex-col gap-1.5">
                                <label htmlFor="firstName" className="label-caps">First name</label>
                                <Input
                                    type="text"
                                    id="firstName"
                                    name="firstName"
                                    autoComplete="given-name"
                                    value={firstName}
                                    onChange={(e) => setFirstName(e.target.value)}
                                    required
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label htmlFor="lastName" className="label-caps">Last name</label>
                                <Input
                                    type="text"
                                    id="lastName"
                                    name="lastName"
                                    autoComplete="family-name"
                                    value={lastName}
                                    onChange={(e) => setLastName(e.target.value)}
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
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
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
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="confirmPassword" className="label-caps">Confirm password</label>
                            <Input
                                type="password"
                                id="confirmPassword"
                                name="confirmPassword"
                                autoComplete="new-password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                            />
                        </div>

                        <Button
                            type="submit"
                            size="lg"
                            className="mt-1 w-full"
                            disabled={isPending}
                        >
                            {isPending
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
