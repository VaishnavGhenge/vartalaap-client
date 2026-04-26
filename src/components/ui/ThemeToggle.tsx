"use client";

import { LaptopMinimal, MoonStar, SunMedium } from "lucide-react";
import { ThemeMode, useTheme } from "@/src/components/theme-provider";
import { cn } from "@/src/lib/utils";

const OPTIONS: Array<{ label: string; value: ThemeMode; icon: typeof SunMedium }> = [
    { label: "Light",  value: "light",  icon: SunMedium      },
    { label: "Dark",   value: "dark",   icon: MoonStar        },
    { label: "System", value: "system", icon: LaptopMinimal   },
];

export function ThemeToggle() {
    const { theme, setTheme } = useTheme();

    return (
        <div className="inline-flex items-center gap-0.5 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))]/90 p-1">
            {OPTIONS.map(({ label, value, icon: Icon }) => {
                const active = theme === value;
                return (
                    <button
                        key={value}
                        type="button"
                        onClick={() => setTheme(value)}
                        title={label}
                        aria-label={`${label} theme`}
                        aria-pressed={active}
                        className={cn(
                            "press flex h-7 w-7 items-center justify-center rounded-full",
                            active
                                ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-sm"
                                : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]",
                        )}
                    >
                        <Icon className="h-3.5 w-3.5" />
                    </button>
                );
            })}
        </div>
    );
}
