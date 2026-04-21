"use client";

import Navbar from "@/src/components/ui/Navbar";
import {IBM_Plex_Sans_Devanagari} from "next/font/google";
import {NewMeetingButton} from "@/src/components/ui/NewMeetButton";
import {JoinMeetButton} from "@/src/components/ui/JoinMeetButton";
import { Input } from "@/src/components/ui/input";
import { useRouter } from "next/navigation";
import { useState } from "react";

const ibmPlexSansDevanagari = IBM_Plex_Sans_Devanagari({
    weight: "500",
    subsets: ["cyrillic-ext"],
});

export default function Home() {
    const router = useRouter();
    const [meetingCode, setMeetingCode] = useState("");

    const normalizedMeetingCode = meetingCode.trim().replace(/^\/+/, "");

    const handleJoin = () => {
        if (!normalizedMeetingCode) {
            return;
        }

        router.push(`/${normalizedMeetingCode}`);
    };

    return (
        <div className="min-h-screen">
            <Navbar />
            <main className='mx-auto flex max-w-5xl flex-col px-4 py-10 sm:px-6 lg:px-8 lg:py-16'>
                <section className='flex min-h-[calc(100vh-10rem)] items-center justify-center'>
                    <div className='w-full max-w-3xl text-center'>
                        <p className='text-sm font-medium uppercase tracking-[0.24em] text-[hsl(var(--muted-foreground))]'>
                            Vartalaap
                        </p>
                        <h1 className='mt-4 text-4xl font-semibold tracking-tight text-[hsl(var(--foreground))] sm:text-5xl'>
                            Start or join a meeting
                        </h1>
                        <p className='mx-auto mt-4 max-w-xl text-base leading-7 text-[hsl(var(--muted-foreground))] sm:text-lg'>
                            Minimal video meetings with a clean interface in light or dark mode.
                        </p>

                        <div className='app-panel mt-10 rounded-[2rem] p-4 sm:p-5'>
                            <div className='flex flex-col gap-3'>
                                <div className='grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]'>
                                    <Input
                                        type='text'
                                        name='meet-code'
                                        value={meetingCode}
                                        onChange={(e) => setMeetingCode(e.target.value)}
                                        placeholder='Meeting code or link'
                                        className='h-12 rounded-2xl border-[hsl(var(--border))] bg-transparent px-4 text-base'
                                    />
                                    <JoinMeetButton
                                        disabled={!normalizedMeetingCode}
                                        onJoin={handleJoin}
                                        className='h-12 rounded-2xl bg-[hsl(var(--surface-2))] text-[hsl(var(--foreground))] shadow-none hover:bg-[hsl(var(--surface-3))]'
                                    />
                                </div>

                                <div className='flex justify-center sm:justify-start'>
                                    <NewMeetingButton
                                        variant="ghost"
                                        className='h-10 rounded-full px-4 text-sm text-[hsl(var(--primary))] hover:bg-[hsl(var(--surface-2))]'
                                    />
                                </div>
                            </div>
                        </div>

                        <div className='mt-8 flex items-center justify-center gap-3 text-sm text-[hsl(var(--muted-foreground))]'>
                            <span className={`text-lg text-[hsl(var(--foreground))] ${ibmPlexSansDevanagari.className}`}>
                                वार्तालाप
                            </span>
                            <span className='h-1 w-1 rounded-full bg-[hsl(var(--border))]' />
                            <span>Fast to open, easy to share</span>
                        </div>
                    </div>
                </section>
            </main>
        </div>
    );
}
