import { Bell } from "lucide-react";

import { cn } from "@/src/lib/utils";

interface EmailReminderNoticeProps {
    startsAt: string;
    currentAt: string | number;
    className?: string;
}

export function EmailReminderNotice({ startsAt, currentAt, className }: EmailReminderNoticeProps) {
    const remainingMs = new Date(startsAt).getTime() - new Date(currentAt).getTime();
    if (!Number.isFinite(remainingMs) || remainingMs <= 60 * 60 * 1000) return null;

    const message = remainingMs > 24 * 60 * 60 * 1000
        ? "Email reminders go to both participants 24 hours and 1 hour before."
        : "A 1-hour email reminder will go to both participants.";

    return (
        <div className={cn("flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]", className)}>
            <Bell className="size-3.5 shrink-0" />
            <span>{message}</span>
        </div>
    );
}
