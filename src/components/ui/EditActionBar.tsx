import { Check, Pencil, RotateCcw } from "lucide-react";

import { BufferingButtonLabel } from "@/src/components/ui/BufferingButtonLabel";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/lib/utils";

// ─── Edit trigger ─────────────────────────────────────────────────────────────
// Use this as the resting-state CTA before the user enters edit mode.

interface EditTriggerProps {
    onClick: () => void;
    disabled?: boolean;
    label?: string;
    className?: string;
}

export function EditTrigger({ onClick, disabled, label = "Edit", className }: EditTriggerProps) {
    return (
        <Button variant="primary" size="sm" disabled={disabled} onClick={onClick} className={className}>
            <Pencil className="size-3.5" />
            {label}
        </Button>
    );
}

// ─── Edit action bar ──────────────────────────────────────────────────────────
// Drop this wherever a section switches between view/edit mode.
// clear* props are optional — omit them for panels with no reset action.

interface EditActionBarProps {
    // Optional destructive reset before saving
    onClear?: () => void;
    clearLabel?: string;
    clearDisabled?: boolean;
    // Discard edits
    onCancel: () => void;
    cancelLabel?: string;
    cancelDisabled?: boolean;
    // Persist changes
    onSave?: () => void;
    saveLabel?: string;
    saving?: boolean;
    saveDisabled?: boolean;
    // Use "submit" when the bar lives inside a <form>
    saveType?: "button" | "submit";
    className?: string;
}

export function EditActionBar({
    onClear,
    clearLabel = "Reset",
    clearDisabled,
    onCancel,
    cancelLabel = "Cancel",
    cancelDisabled,
    onSave,
    saveLabel = "Save",
    saving,
    saveDisabled,
    saveType = "button",
    className,
}: EditActionBarProps) {
    return (
        <div className={cn("flex items-center gap-1.5", className)}>
            {onClear && (
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={clearDisabled || saving}
                    onClick={onClear}
                    className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                >
                    <RotateCcw className="size-3.5" />
                    {clearLabel}
                </Button>
            )}
            <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={cancelDisabled || saving}
                onClick={onCancel}
                className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
            >
                {cancelLabel}
            </Button>
            <Button
                type={saveType}
                size="sm"
                disabled={saveDisabled || saving}
                onClick={saveType === "button" ? onSave : undefined}
            >
                {saving
                    ? <BufferingButtonLabel label="Saving…" />
                    : <><Check className="size-3.5" />{saveLabel}</>}
            </Button>
        </div>
    );
}
