"use client";

import Link from "next/link";

import { SessionlyBrand } from "@/src/components/ui/SessionlyBrand";
import { ThemeToggleButton } from "@/src/components/ui/ThemeToggleButton";
import { cn } from "@/src/lib/utils";

interface StandaloneHeaderProps {
    className?: string;
}

export function StandaloneHeader({ className }: StandaloneHeaderProps) {
    return (
        <header className={cn("mb-6 flex w-full max-w-3xl items-center justify-between sm:mb-8", className)}>
            <Link href="/" className="flex min-w-0 items-center">
                <SessionlyBrand size="md" wordmarkClassName="text-2xl" markClassName="size-8" />
            </Link>
            <ThemeToggleButton className="shrink-0" />
        </header>
    );
}
