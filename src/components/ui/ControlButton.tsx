import { cn } from "@/src/lib/utils";
import type { LucideIcon } from "lucide-react";

interface ControlButtonProps {
    onClick: () => void;
    active: boolean;
    activeIcon: LucideIcon;
    inactiveIcon: LucideIcon;
    activeLabel: string;
    inactiveLabel: string;
    size?: "sm" | "md";
    className?: string;
}

export function ControlButton({
    onClick,
    active,
    activeIcon: ActiveIcon,
    inactiveIcon: InactiveIcon,
    activeLabel,
    inactiveLabel,
    size = "md",
    className,
}: ControlButtonProps) {
    const dim = size === "sm" ? "h-8 w-8" : "h-9 w-9 sm:h-11 sm:w-11";
    const iconSize = size === "sm" ? "w-4 h-4" : "w-4 h-4 sm:w-5 sm:h-5";

    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={active ? activeLabel : inactiveLabel}
            className={cn(
                "ctrl-btn",
                dim,
                active ? "ctrl-btn-on" : "ctrl-btn-off",
                className,
            )}
        >
            {active
                ? <ActiveIcon className={iconSize} />
                : <InactiveIcon className={iconSize} />
            }
        </button>
    );
}
