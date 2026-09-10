"use client";

import { BufferingButtonLabel } from "@/src/components/ui/BufferingButtonLabel";
import Link from "next/link";
import { useState } from "react";
import { Input } from "@/src/components/ui/input";
import { Button } from "@/src/components/ui/button";
import { AuthShell } from "@/src/components/ui/AuthShell";
import { PageLoading } from "@/src/components/ui/PageLoading";
import { FormError } from "@/src/components/ui/FormError";
import { useRegister, safeNextPath, useAuthRedirect } from "@/src/hooks/use-auth";
import { useAuthStore } from "@/src/stores/auth";

export default function Register() {
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const { mutate: registerUser, isPending, error } = useRegister();
    const [validationError, setValidationError] = useState<string | null>(null);
    const { isAuthenticated, isLoading } = useAuthStore();
    useAuthRedirect();

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setValidationError(null);
        if (password !== confirmPassword) {
            setValidationError("Your passwords don’t match. Enter the same password in both fields.");
            return;
        }
        registerUser({
            name: `${firstName.trim()} ${lastName.trim()}`.trim(),
            email,
            password,
        });
    }

    if (isLoading || isAuthenticated)
        return (
            <PageLoading
                layout="register"
                label={isLoading ? "Checking your session…" : "Getting your booking page started…"}
            />
        );

    return (
        <AuthShell
            title="Make time for your clients."
            description="Create your free account. Next, we’ll set up your booking page and availability."
        >
            <form onSubmit={handleSubmit} aria-busy={isPending} className="mt-6 flex flex-col gap-4">
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
                            value={firstName}
                            onChange={(e) => setFirstName(e.target.value)}
                            required
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
                            value={lastName}
                            onChange={(e) => setLastName(e.target.value)}
                        />
                    </div>
                </div>

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
                        Password{" "}
                        <span className="normal-case tracking-normal font-normal opacity-60">(min 8 chars)</span>
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
                    <label htmlFor="confirmPassword" className="label-caps">
                        Confirm password
                    </label>
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

                <FormError>{validationError ?? error?.message}</FormError>
                <Button type="submit" size="lg" className="mt-1 w-full" disabled={isPending}>
                    {isPending ? <BufferingButtonLabel label="Creating account…" /> : "Create account"}
                </Button>
            </form>

            <p className="mt-6 text-center text-xs text-[hsl(var(--muted-foreground))]">
                Already have an account?{" "}
                <Link
                    href={safeNextPath() ? `/login?next=${encodeURIComponent(safeNextPath()!)}` : "/login"}
                    className="link"
                    prefetch
                >
                    Sign in
                </Link>
            </p>
        </AuthShell>
    );
}
