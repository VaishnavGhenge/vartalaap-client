import { cn } from "@/src/lib/utils";

type SessionlyBrandSize = "sm" | "md" | "lg";

type SessionlyBrandProps = {
    className?: string;
    markClassName?: string;
    wordmarkClassName?: string;
    size?: SessionlyBrandSize;
    variant?: "full" | "mark" | "wordmark";
};

type SessionlyBrandMarkProps = {
    className?: string;
    size?: SessionlyBrandSize;
    decorative?: boolean;
};

type SessionlyDomainProps = {
    className?: string;
    path?: string;
};

const MARK_SIZE_CLASSES: Record<SessionlyBrandSize, string> = {
    sm: "size-6 rounded-lg",
    md: "size-7 rounded-[0.6rem]",
    lg: "size-10 rounded-xl",
};

const WORDMARK_SIZE_CLASSES: Record<SessionlyBrandSize, string> = {
    sm: "text-base",
    md: "text-xl",
    lg: "text-3xl",
};

const GAP_SIZE_CLASSES: Record<SessionlyBrandSize, string> = {
    sm: "gap-2",
    md: "gap-2.5",
    lg: "gap-3",
};

export function SessionlyBrand({
    className,
    markClassName,
    wordmarkClassName,
    size = "md",
    variant = "wordmark",
}: SessionlyBrandProps) {
    if (variant === "mark") {
        return <SessionlyBrandMark className={cn("text-[hsl(var(--primary-foreground))]", className)} size={size} decorative={false} />;
    }

    return (
        <span
            className={cn(
                "inline-flex items-center text-[hsl(var(--foreground))]",
                GAP_SIZE_CLASSES[size],
                className,
            )}
        >
            {variant === "full" && (
                <SessionlyBrandMark
                    className={markClassName}
                    size={size}
                    decorative
                />
            )}
            <SessionlyWordmark
                className={cn(WORDMARK_SIZE_CLASSES[size], wordmarkClassName)}
            />
        </span>
    );
}

export function SessionlyBrandMark({
    className,
    size = "md",
    decorative = true,
}: SessionlyBrandMarkProps) {
    return (
        <span
            aria-hidden={decorative || undefined}
            aria-label={decorative ? undefined : "Sessionly"}
            role={decorative ? undefined : "img"}
            className={cn(
                "inline-flex shrink-0 items-center justify-center border border-[hsl(var(--primary))]/40 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-[0_14px_28px_-22px_hsl(var(--shadow-color)/0.65)]",
                MARK_SIZE_CLASSES[size],
                className,
            )}
        >
            <svg
                viewBox="0 0 32 32"
                className="size-[72%]"
                fill="none"
                focusable="false"
            >
                <path
                    d="M9.25 11.25h13.5"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeWidth="2.25"
                    opacity="0.7"
                />
                <path
                    d="M12 8.5v5M20 8.5v5"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeWidth="2.25"
                    opacity="0.78"
                />
                <path
                    d="M8.5 17.2c0-1.2.97-2.17 2.17-2.17h7.35c1.2 0 2.17.97 2.17 2.17v.3l3.88-2.12c.63-.34 1.4.11 1.4.83v7.08c0 .72-.77 1.17-1.4.83L20.19 22v.3c0 1.2-.97 2.17-2.17 2.17h-7.35A2.17 2.17 0 0 1 8.5 22.3v-5.1Z"
                    fill="currentColor"
                />
            </svg>
        </span>
    );
}

export function SessionlyWordmark({ className }: { className?: string }) {
    return (
        <span
            className={cn(
                "inline-flex items-baseline font-[var(--font-brand)] font-bold leading-none tracking-[-0.02em] text-[hsl(var(--primary))]",
                className,
            )}
        >
            <span>Session</span>
            <span className="opacity-50">ly</span>
        </span>
    );
}

export function SessionlyDomain({ className, path }: SessionlyDomainProps) {
    return (
        <span
            className={cn(
                "inline-flex items-baseline font-[var(--font-sessionly)] font-medium leading-none tracking-normal",
                className,
            )}
        >
            <span>getsessionly</span>
            <span className="opacity-60">.com</span>
            {path && <span className="opacity-80">{path}</span>}
        </span>
    );
}
