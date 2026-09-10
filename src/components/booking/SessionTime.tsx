"use client";

import { useEffect, useState } from "react";

export function SessionTime({ startsAt, endsAt }: { startsAt: string; endsAt: string }) {
    const [timezone, setTimezone] = useState("UTC");
    useEffect(() => {
        setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    }, []);
    const date = new Date(startsAt);
    return (
        <div className="mt-5 rounded-xl bg-[hsl(var(--surface-2))] p-4 text-sm">
            <p className="font-medium">
                <time dateTime={startsAt}>
                    {date.toLocaleDateString([], {
                        timeZone: timezone,
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                    })}
                </time>
            </p>
            <p className="mt-1 text-[hsl(var(--muted-foreground))]">
                {date.toLocaleTimeString([], {
                    timeZone: timezone,
                    hour: "numeric",
                    minute: "2-digit",
                })}{" "}
                –{" "}
                {new Date(endsAt).toLocaleTimeString([], {
                    timeZone: timezone,
                    hour: "numeric",
                    minute: "2-digit",
                })}
            </p>
            <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
                Times shown in {timezone.replaceAll("_", " ")}
            </p>
        </div>
    );
}
