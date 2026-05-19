import { AlertTriangle, Info, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/src/lib/utils";

type Tone = "info" | "warning" | "danger";

const TONE_STYLES: Record<Tone, {
    container: string;
    iconWrap: string;
    icon: string;
    title: string;
}> = {
    info: {
        container: "border-[hsl(var(--border))]/70 bg-[hsl(var(--surface-2))]/70",
        iconWrap: "bg-[hsl(var(--primary))]/10",
        icon: "text-[hsl(var(--primary))]",
        title: "text-[hsl(var(--foreground))]",
    },
    warning: {
        container: "border-amber-500/25 bg-amber-500/10",
        iconWrap: "bg-amber-500/15",
        icon: "text-amber-600 dark:text-amber-400",
        title: "text-[hsl(var(--foreground))]",
    },
    danger: {
        container: "border-[hsl(var(--destructive))]/25 bg-[hsl(var(--destructive))]/10",
        iconWrap: "bg-[hsl(var(--destructive))]/10",
        icon: "text-[hsl(var(--destructive))]",
        title: "text-[hsl(var(--destructive))]",
    },
};

export function InlineNotice({
    tone = "info",
    title,
    children,
    icon: Icon,
    className,
}: {
    tone?: Tone;
    title?: ReactNode;
    children: ReactNode;
    icon?: LucideIcon;
    className?: string;
}) {
    const styles = TONE_STYLES[tone];
    const NoticeIcon = Icon ?? (tone === "warning" ? AlertTriangle : Info);

    return (
        <div
            role={tone === "danger" ? "alert" : undefined}
            className={cn(
                "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm leading-5",
                styles.container,
                className,
            )}
        >
            <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-lg", styles.iconWrap)}>
                <NoticeIcon className={cn("size-3.5", styles.icon)} />
            </span>
            <div className="min-w-0">
                {title && <p className={cn("font-semibold", styles.title)}>{title}</p>}
                <div className={cn(title ? "mt-0.5" : "", "text-[hsl(var(--muted-foreground))]")}>
                    {children}
                </div>
            </div>
        </div>
    );
}
