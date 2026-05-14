"use client";

import Navbar from "@/src/components/ui/Navbar";
import { BrandWordmark } from "@/src/components/ui/BrandWordmark";
import { NewMeetingButton } from "@/src/components/ui/NewMeetButton";
import { JoinMeetButton } from "@/src/components/ui/JoinMeetButton";
import { Input } from "@/src/components/ui/input";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const meetCodePattern = /^[a-z2-9]{3}-[a-z2-9]{4}-[a-z2-9]{3}$/;

export default function Home() {
    const router = useRouter();
    const [meetingCode, setMeetingCode] = useState("");
    const [isJoining, startJoinTransition] = useTransition();

    const normalizedCode = (() => {
        const trimmed = meetingCode.trim();
        try {
            const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
            const path = url.pathname.replace(/^\/+|\/+$/g, '');
            if (path) return path.toLowerCase();
        } catch { /* not a url */ }
        return trimmed.replace(/^\/+|\/+$/g, '').toLowerCase();
    })();
    const canJoin = meetCodePattern.test(normalizedCode);

    const handleJoin = () => {
        if (!canJoin || isJoining) return;
        startJoinTransition(() => {
            router.push(`/${normalizedCode}`);
        });
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleJoin();
    };

    return (
        <div className="flex min-h-dvh flex-col">
            <Navbar />

            <main className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6">
                <div className="w-full max-w-sm sm:max-w-md">

                    {/* Identity mark */}
                    <div className="mb-10 flex flex-col items-center gap-3 text-center">
                        <BrandWordmark className="text-5xl sm:text-6xl" variant="rozha" />
                        <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed">
                            Instant video calls. No accounts, no downloads.
                        </p>
                    </div>

                    {/* Action panel */}
                    <div className="app-panel rounded-2xl p-4 sm:p-5">
                        <div className="flex flex-col gap-3">
                            <NewMeetingButton
                                variant="primary"
                                size="lg"
                                className="w-full"
                            />

                            <div className="relative flex items-center gap-2">
                                <div className="h-px flex-1 bg-[hsl(var(--border))]" />
                                <span className="label-caps">or join one</span>
                                <div className="h-px flex-1 bg-[hsl(var(--border))]" />
                            </div>

                            <div className="flex gap-2">
                                <Input
                                    type="text"
                                    name="meet-code"
                                    value={meetingCode}
                                    onChange={(e) => setMeetingCode(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder="Code or link"
                                    className="meet-code flex-1"
                                    autoComplete="off"
                                    autoCorrect="off"
                                    spellCheck={false}
                                    disabled={isJoining}
                                />
                                <JoinMeetButton
                                    disabled={!canJoin || isJoining}
                                    loading={isJoining}
                                    onJoin={handleJoin}
                                    className="shrink-0"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
