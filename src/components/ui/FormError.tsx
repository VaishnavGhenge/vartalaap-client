import { AlertCircle } from "lucide-react";

import { cn } from "@/src/lib/utils";

export function FieldError({
    id,
    children,
    className,
}: {
    id?: string;
    children?: React.ReactNode;
    className?: string;
}) {
    if (!children) return null;
    return (
        <p id={id} className={cn("mt-1.5 text-xs leading-5 text-[hsl(var(--destructive))]", className)}>
            {children}
        </p>
    );
}

export function FormError({
    children,
    className,
}: {
    children?: React.ReactNode;
    className?: string;
}) {
    if (!children) return null;
    return (
        <div
            role="alert"
            className={cn(
                "flex items-start gap-2 rounded-xl border border-[hsl(var(--destructive))]/25 bg-[hsl(var(--destructive))]/10 px-3 py-2 text-sm text-[hsl(var(--destructive))]",
                className,
            )}
        >
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <p className="min-w-0 leading-5">{children}</p>
        </div>
    );
}
