"use client";

import { AlertTriangle, X } from "lucide-react";
import { useEffect, useId } from "react";

import { BufferingButtonLabel } from "@/src/components/ui/BufferingButtonLabel";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/lib/utils";

interface ConfirmDialogProps {
    open: boolean;
    title: string;
    description?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    loadingLabel?: string;
    destructive?: boolean;
    pending?: boolean;
    error?: string | null;
    reasonLabel?: string;
    reasonPlaceholder?: string;
    reasonValue?: string;
    reasonRequired?: boolean;
    onReasonChange?: (value: string) => void;
    onConfirm: () => void;
    onOpenChange: (open: boolean) => void;
}

export function ConfirmDialog({
    open,
    title,
    description,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    loadingLabel = "Working...",
    destructive = false,
    pending = false,
    error,
    reasonLabel,
    reasonPlaceholder,
    reasonValue,
    reasonRequired = false,
    onReasonChange,
    onConfirm,
    onOpenChange,
}: ConfirmDialogProps) {
    const titleId = useId();
    const descriptionId = useId();

    useEffect(() => {
        if (!open) return;

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        function onKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape" && !pending) {
                onOpenChange(false);
            }
        }

        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [open, pending, onOpenChange]);

    if (!open) return null;
    const reasonMissing = reasonRequired && (reasonValue ?? "").trim().length === 0;

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            className="fixed inset-0 z-[90] flex items-center justify-center p-4"
        >
            <button
                type="button"
                aria-label="Close dialog"
                disabled={pending}
                onClick={() => onOpenChange(false)}
                className="absolute inset-0 cursor-default bg-[hsl(var(--background))]/70 backdrop-blur-sm disabled:pointer-events-none"
            />
            <div className="app-panel no-lift relative w-full max-w-sm rounded-2xl border border-[hsl(var(--border))]/80 p-4 shadow-2xl">
                <div className="flex items-start gap-3">
                    <span
                        className={cn(
                            "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl",
                            destructive
                                ? "bg-[hsl(var(--destructive))]/10 text-[hsl(var(--destructive))]"
                                : "bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]",
                        )}
                    >
                        <AlertTriangle className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <h2 id={titleId} className="text-sm font-semibold text-[hsl(var(--foreground))]">
                            {title}
                        </h2>
                        {description && (
                            <p id={descriptionId} className="mt-1 text-sm leading-5 text-[hsl(var(--muted-foreground))]">
                                {description}
                            </p>
                        )}
                    </div>
                    <button
                        type="button"
                        aria-label="Close dialog"
                        disabled={pending}
                        onClick={() => onOpenChange(false)}
                        className="press -mr-1 -mt-1 inline-flex size-8 items-center justify-center rounded-lg text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--foreground))] disabled:pointer-events-none disabled:opacity-40"
                    >
                        <X className="size-4" />
                    </button>
                </div>

                {error && (
                    <p className="mt-3 rounded-lg bg-[hsl(var(--destructive))]/10 px-3 py-2 text-xs text-[hsl(var(--destructive))]">
                        {error}
                    </p>
                )}

                {onReasonChange && (
                    <div className="mt-3">
                        {reasonLabel && (
                            <label htmlFor={`${descriptionId}-reason`} className="label-caps">
                                {reasonLabel}
                            </label>
                        )}
                        <textarea
                            id={`${descriptionId}-reason`}
                            value={reasonValue ?? ""}
                            onChange={(event) => onReasonChange(event.target.value)}
                            placeholder={reasonPlaceholder}
                            disabled={pending}
                            maxLength={500}
                            rows={3}
                            className="mt-1 w-full resize-none rounded-xl border border-[hsl(var(--border))]/80 bg-[hsl(var(--surface-2))] px-3 py-2 text-sm text-[hsl(var(--foreground))] outline-none transition-colors placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--primary))]/70 focus:ring-2 focus:ring-[hsl(var(--primary))]/15 disabled:cursor-not-allowed disabled:opacity-60"
                        />
                    </div>
                )}

                <div className="mt-4 flex justify-end gap-2">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        onClick={() => onOpenChange(false)}
                    >
                        {cancelLabel}
                    </Button>
                    <Button
                        type="button"
                        variant={destructive ? "destructive" : "primary"}
                        size="sm"
                        disabled={pending || reasonMissing}
                        onClick={onConfirm}
                    >
                        {pending ? <BufferingButtonLabel label={loadingLabel} /> : confirmLabel}
                    </Button>
                </div>
            </div>
        </div>
    );
}
