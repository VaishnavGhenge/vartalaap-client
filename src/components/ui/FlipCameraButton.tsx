"use client";

import { FlipHorizontal2 } from "lucide-react";

interface FlipCameraButtonProps {
    onClickFn: () => void;
    size?: "sm" | "md";
}

export function FlipCameraButton({ onClickFn, size = "md" }: FlipCameraButtonProps) {
    const dim = size === "sm" ? "h-8 w-8" : "h-9 w-9 sm:h-11 sm:w-11";
    const iconSize = size === "sm" ? "w-4 h-4" : "w-4 h-4 sm:w-5 sm:h-5";

    return (
        <button
            type="button"
            onClick={onClickFn}
            aria-label="Switch camera"
            className={`ctrl-btn ctrl-btn-on ${dim}`}
        >
            <FlipHorizontal2 className={iconSize} aria-hidden="true" />
        </button>
    );
}
