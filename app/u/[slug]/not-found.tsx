import Link from "next/link";

import { Button } from "@/src/components/ui/button";
import { PoweredBy } from "@/src/components/ui/PoweredBy";
import { StandaloneHeader } from "@/src/components/ui/StandaloneHeader";

export default function HostNotFound() {
    return (
        <div className="relative flex min-h-dvh flex-col">
            <main className="flex flex-1 flex-col items-center px-4 py-6 sm:px-6 sm:py-12">
                <StandaloneHeader />

                <div className="w-full max-w-xl">
                    <div className="app-panel rounded-2xl px-5 py-10 text-center">
                        <h1 className="text-2xl font-semibold tracking-tight text-[hsl(var(--foreground))] sm:text-3xl">
                            Host not found
                        </h1>
                        <p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">
                            This Sessionly link doesn&apos;t belong to anyone yet.
                        </p>
                        <div className="mt-6 flex justify-center">
                            <Button asChild>
                                <Link href="/">Go home</Link>
                            </Button>
                        </div>
                    </div>
                </div>
                <PoweredBy />
            </main>
        </div>
    );
}
