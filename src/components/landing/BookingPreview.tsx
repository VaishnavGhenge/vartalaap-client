"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, CalendarCheck, Check, Clock, Video, Mic, PhoneOff } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Avatar } from "@/src/components/ui/Avatar";
import { cn } from "@/src/lib/utils";

const TIMES = ["9:00 AM", "10:30 AM", "1:00 PM", "3:30 PM"];

export function BookingPreview() {
    const [time, setTime] = useState("10:30 AM");
    const [confirmed, setConfirmed] = useState(false);
    const [room, setRoom] = useState(false);

    return (
        <div className="booking-preview relative mx-auto w-full max-w-lg">
            <div className="relative overflow-hidden rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] shadow-[0_24px_80px_-32px_hsl(var(--shadow-color)/0.3)]">
                <div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-6 py-4 text-xs text-[hsl(var(--muted-foreground))]">
                    <span>Jane’s booking page</span>
                    <span className="rounded-full bg-[hsl(var(--success-soft))] px-2 py-1 text-[hsl(var(--success-soft-foreground))]">
                        Interactive preview
                    </span>
                </div>
                <div className="min-h-[440px] p-6 sm:p-8">
                    {room ? (
                        <div className="page-enter flex min-h-[376px] flex-col justify-center">
                            <p className="label-caps">Your video room · Preview</p>
                            <h2 className="mt-3 text-2xl font-semibold tracking-tight">From booked to together.</h2>
                            <div
                                className="my-6 grid grid-cols-2 gap-3"
                                aria-label="Illustration of a two-person video room"
                            >
                                <div className="flex aspect-square flex-col items-center justify-center gap-3 rounded-2xl bg-[hsl(var(--secondary))]">
                                    <Avatar name="Jane Smith" src="/brand/demo-host-jane.webp" size="lg" />
                                    <span className="text-xs">Jane · Host</span>
                                </div>
                                <div className="flex aspect-square flex-col items-center justify-center gap-3 rounded-2xl bg-[hsl(var(--success-soft))]">
                                    <Avatar name="Alex Chen" size="lg" />
                                    <span className="text-xs">Alex · Client</span>
                                </div>
                            </div>
                            <div aria-hidden="true" className="mb-5 flex justify-center gap-3">
                                <span className="rounded-full bg-[hsl(var(--surface-2))] p-3">
                                    <Mic className="size-4" />
                                </span>
                                <span className="rounded-full bg-[hsl(var(--surface-2))] p-3">
                                    <Video className="size-4" />
                                </span>
                                <span className="rounded-full bg-[hsl(var(--destructive))] p-3 text-[hsl(var(--destructive-foreground))]">
                                    <PhoneOff className="size-4" />
                                </span>
                            </div>
                            <p className="text-center text-xs leading-5 text-[hsl(var(--muted-foreground))]">
                                A private room for your session. This preview doesn’t access your camera or microphone.
                            </p>
                            <Button
                                variant="ghost"
                                className="mt-4"
                                onClick={() => {
                                    setRoom(false);
                                    setConfirmed(false);
                                }}
                            >
                                <ArrowLeft className="size-4" /> Back to booking preview
                            </Button>
                        </div>
                    ) : confirmed ? (
                        <div
                            className="page-enter flex min-h-[376px] flex-col items-center justify-center text-center"
                            role="status"
                        >
                            <span className="success-mark mb-6 flex size-16 items-center justify-center rounded-full bg-[hsl(var(--success-soft))] text-[hsl(var(--success))]">
                                <Check className="size-8" />
                            </span>
                            <p className="label-caps">Confirmation preview</p>
                            <h2 className="font-display mt-3 text-4xl">You’re booked.</h2>
                            <p className="mt-4 text-sm text-[hsl(var(--muted-foreground))]">
                                Wednesday, October 7 · {time}
                            </p>
                            <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
                                Strategy session with Jane · 30 minutes
                            </p>
                            <p className="mt-6 max-w-xs text-xs leading-5 text-[hsl(var(--muted-foreground))]">
                                This is a preview. No booking was made or email sent. A real confirmation includes your
                                private video room link.
                            </p>
                            <Button className="mt-5 w-full" onClick={() => setRoom(true)}>
                                <Video className="size-4" /> Preview the video room
                            </Button>
                            <Button variant="ghost" className="mt-2" onClick={() => setConfirmed(false)}>
                                <ArrowLeft className="size-4" /> Try another time
                            </Button>
                        </div>
                    ) : (
                        <div className="page-enter">
                            <div className="flex items-center gap-3">
                                <Avatar name="Jane Smith" src="/brand/demo-host-jane.webp" size="lg" />
                                <div>
                                    <p className="text-sm font-semibold">Jane Smith</p>
                                    <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Business coach</p>
                                </div>
                            </div>
                            <h2 className="font-display mt-6 text-3xl">30-minute strategy session</h2>
                            <div className="mt-3 flex flex-wrap gap-4 text-xs text-[hsl(var(--muted-foreground))]">
                                <span className="flex items-center gap-1.5">
                                    <Clock className="size-3.5" />
                                    30 minutes
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <Video className="size-3.5" />
                                    Video call included
                                </span>
                            </div>
                            <div className="my-6 border-t border-[hsl(var(--border))]" />
                            <fieldset>
                                <legend className="mb-4 text-sm font-medium">
                                    Wednesday, October 7{" "}
                                    <span className="ml-1 text-xs font-normal text-[hsl(var(--muted-foreground))]">
                                        · Sample times
                                    </span>
                                </legend>
                                <div className="grid grid-cols-2 gap-2">
                                    {TIMES.map((slot) => (
                                        <button
                                            key={slot}
                                            type="button"
                                            aria-pressed={time === slot}
                                            onClick={() => setTime(slot)}
                                            className={cn(
                                                "rounded-xl border px-3 py-3 text-sm font-medium",
                                                time === slot
                                                    ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/8 text-[hsl(var(--primary))]"
                                                    : "border-[hsl(var(--border))] hover:border-[hsl(var(--primary))]",
                                            )}
                                        >
                                            {slot}
                                        </button>
                                    ))}
                                </div>
                            </fieldset>
                            <Button className="mt-5 w-full" size="lg" onClick={() => setConfirmed(true)}>
                                Preview confirmation <ArrowRight className="size-4" />
                            </Button>
                            <p className="mt-3 text-center text-xs text-[hsl(var(--muted-foreground))]">
                                Try it. Pick a time that suits you.
                            </p>
                        </div>
                    )}
                </div>
            </div>
            <div className="relative mx-4 -mt-1 flex items-center gap-3 rounded-b-2xl border border-t-0 border-[hsl(var(--border))] bg-[hsl(var(--success-soft))] px-5 py-4 text-sm">
                <CalendarCheck className="size-5 shrink-0 text-[hsl(var(--success))]" />
                <span>Pick a time. Get a link. Meet here.</span>
            </div>
        </div>
    );
}
