"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

export type ThemeMode = "light" | "dark" | "system";
type ResolvedTheme = Exclude<ThemeMode, "system">;

interface ThemeContextValue {
    theme: ThemeMode;
    resolvedTheme: ResolvedTheme;
    setTheme: (theme: ThemeMode) => void;
}

const STORAGE_KEY = "vartalaap-theme";

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getSystemTheme(): ResolvedTheme {
    if (typeof window === "undefined") {
        return "light";
    }

    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: ThemeMode) {
    const root = document.documentElement;
    const resolved = theme === "system" ? getSystemTheme() : theme;

    root.classList.toggle("dark", resolved === "dark");
    root.dataset.theme = resolved;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setThemeState] = useState<ThemeMode>("system");
    const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light");

    useEffect(() => {
        const savedTheme = window.localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
        const initialTheme = savedTheme === "light" || savedTheme === "dark" || savedTheme === "system"
            ? savedTheme
            : "system";

        setThemeState(initialTheme);

        const nextResolved = initialTheme === "system" ? getSystemTheme() : initialTheme;
        setResolvedTheme(nextResolved);
        applyTheme(initialTheme);
    }, []);

    useEffect(() => {
        const media = window.matchMedia("(prefers-color-scheme: dark)");
        const handleChange = () => {
            if (theme !== "system") {
                return;
            }

            const nextResolved = getSystemTheme();
            setResolvedTheme(nextResolved);
            applyTheme("system");
        };

        handleChange();
        media.addEventListener("change", handleChange);

        return () => media.removeEventListener("change", handleChange);
    }, [theme]);

    const setTheme = (nextTheme: ThemeMode) => {
        setThemeState(nextTheme);
        window.localStorage.setItem(STORAGE_KEY, nextTheme);

        const nextResolved = nextTheme === "system" ? getSystemTheme() : nextTheme;
        setResolvedTheme(nextResolved);
        applyTheme(nextTheme);
    };

    const value = useMemo(
        () => ({
            theme,
            resolvedTheme,
            setTheme,
        }),
        [theme, resolvedTheme],
    );

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
    const context = useContext(ThemeContext);

    if (!context) {
        throw new Error("useTheme must be used within ThemeProvider");
    }

    return context;
}
