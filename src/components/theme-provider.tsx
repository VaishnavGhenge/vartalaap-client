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
const COOKIE_KEY = "vartalaap-theme";
// 1 year — cookie matches localStorage's effective lifetime so the server can
// render the right class on first paint without an inline init script.
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function readThemeCookie(): ThemeMode | null {
    if (typeof document === "undefined") return null;
    const match = document.cookie.match(/(?:^|;\s*)vartalaap-theme=(light|dark|system)/);
    return match ? (match[1] as ThemeMode) : null;
}

function writeThemeCookie(theme: ThemeMode) {
    document.cookie = `${COOKIE_KEY}=${theme}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

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
        // Cookie wins over localStorage — it's the source of truth the server
        // reads to set the initial <html> class. localStorage stays as a
        // legacy fallback for sessions that pre-date the cookie migration.
        const cookieTheme = readThemeCookie();
        const savedTheme = cookieTheme ?? (window.localStorage.getItem(STORAGE_KEY) as ThemeMode | null);
        const initialTheme = savedTheme === "light" || savedTheme === "dark" || savedTheme === "system"
            ? savedTheme
            : "system";

        setThemeState(initialTheme);

        const nextResolved = initialTheme === "system" ? getSystemTheme() : initialTheme;
        setResolvedTheme(nextResolved);
        applyTheme(initialTheme);

        // Backfill the cookie so the next SSR can set the right class without
        // a flash, even for users who only had localStorage set.
        if (!cookieTheme) writeThemeCookie(initialTheme);
    }, []);

    useEffect(() => {
        if (theme !== "system") return;

        const media = window.matchMedia("(prefers-color-scheme: dark)");
        const handleChange = () => {
            setResolvedTheme(getSystemTheme());
            applyTheme("system");
        };

        media.addEventListener("change", handleChange);
        return () => media.removeEventListener("change", handleChange);
    }, [theme]);

    const setTheme = (nextTheme: ThemeMode) => {
        setThemeState(nextTheme);
        window.localStorage.setItem(STORAGE_KEY, nextTheme);
        writeThemeCookie(nextTheme);

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
