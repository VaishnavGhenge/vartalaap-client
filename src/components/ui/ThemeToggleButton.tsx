"use client";

import { MoonStar, SunMedium } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { useTheme } from "@/src/components/theme-provider";
import { cn } from "@/src/lib/utils";

interface ThemeToggleButtonProps {
    className?: string;
}

export function ThemeToggleButton({ className }: ThemeToggleButtonProps) {
    const { resolvedTheme, setTheme } = useTheme();
    const isDark = resolvedTheme === "dark";
    const nextTheme = isDark ? "light" : "dark";
    const label = isDark ? "Switch to light theme" : "Switch to dark theme";
    const Icon = isDark ? SunMedium : MoonStar;

    return (
        <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={label}
            onClick={() => setTheme(nextTheme)}
            className={cn("size-10 rounded-lg text-[hsl(var(--foreground))]", className)}
        >
            <Icon className="size-4.5" />
        </Button>
    );
}
