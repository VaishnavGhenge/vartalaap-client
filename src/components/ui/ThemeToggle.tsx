"use client";

import { LaptopMinimal, MoonStar, SunMedium } from "lucide-react";
import { ThemeMode, useTheme } from "@/src/components/theme-provider";
import { cn } from "@/src/lib/utils";

const OPTIONS: Array<{
    label: string;
    value: ThemeMode;
    icon: typeof SunMedium;
}> = [
    { label: "Light", value: "light", icon: SunMedium },
    { label: "Dark", value: "dark", icon: MoonStar },
    { label: "System", value: "system", icon: LaptopMinimal },
];

export function ThemeToggle() {
    const { theme, setTheme } = useTheme();

    return (
        <div className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))]/90 p-1 shadow-sm backdrop-blur">
            {OPTIONS.map(({ label, value, icon: Icon }) => {
                const active = theme === value;

                return (
                    <button
                        key={value}
                        type="button"
                        onClick={() => setTheme(value)}
                        aria-pressed={active}
                        className={cn(
                            "press inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium",
                            active
                                ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-sm"
                                : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface))] hover:text-[hsl(var(--foreground))]",
                        )}
                    >
                        <Icon className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">{label}</span>
                    </button>
                );
            })}
        </div>
    );
}
