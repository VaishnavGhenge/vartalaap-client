"use client";

import Link from "next/link";
import { Button } from "@/src/components/ui/button";
import { StandaloneHeader } from "@/src/components/ui/StandaloneHeader";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
    return (
        <main className="mx-auto flex min-h-dvh max-w-3xl flex-col items-center px-5 py-8 sm:py-12">
            <StandaloneHeader />
            <div className="experience-card w-full max-w-lg p-8">
                <p className="label-caps">Let’s try that again</p>
                <h1 className="font-display mt-4 text-3xl">This page couldn’t load.</h1>
                <p className="mt-3 text-sm leading-6 text-[hsl(var(--muted-foreground))]">
                    There was a problem getting this page. If you just booked a session, retry here to check its status
                    before booking again.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                    <Button onClick={reset}>Try again</Button>
                    <Button variant="ghost" asChild>
                        <Link href="/">Back to home</Link>
                    </Button>
                </div>
            </div>
        </main>
    );
}
