'use client'

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, UserRound } from "lucide-react";
import AppTitle from "./AppTitle";
import { Button } from "@/src/components/ui/button";
import { ThemeToggleButton } from "@/src/components/ui/ThemeToggleButton";
import { useAuth, useLogout } from "@/src/hooks/use-auth";
import { initialsOf } from "@/src/lib/avatar";

const Navbar = () => {
    const { user, isAuthenticated, isLoading } = useAuth();
    const logout = useLogout();
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!menuOpen) return;
        const handlePointerDown = (event: PointerEvent) => {
            if (menuRef.current?.contains(event.target as Node)) return;
            setMenuOpen(false);
        };
        document.addEventListener("pointerdown", handlePointerDown);
        return () => document.removeEventListener("pointerdown", handlePointerDown);
    }, [menuOpen]);

    return (
        <nav className="sticky top-0 z-40 w-full border-b border-[hsl(var(--border))]/60 bg-[hsl(var(--background))]/80 backdrop-blur-xl">
            <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
                <AppTitle />

                <div className="flex items-center gap-2">
                    <ThemeToggleButton />
                    {!isLoading && (
                        isAuthenticated ? (
                            <div className="relative" ref={menuRef}>
                                <button
                                    type="button"
                                    onClick={() => setMenuOpen((open) => !open)}
                                    aria-haspopup="menu"
                                    aria-expanded={menuOpen}
                                    className="press flex cursor-pointer items-center gap-2 rounded-full border border-[hsl(var(--border))]/70 bg-[hsl(var(--surface-2))] px-2 py-1.5 text-sm text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-3))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]/50"
                                >
                                    {user?.avatarUrl ? (
                                        <img
                                            src={user.avatarUrl}
                                            alt={user.name || user.email}
                                            className="size-7 rounded-full object-cover"
                                        />
                                    ) : (
                                        <span className="flex size-7 items-center justify-center rounded-full bg-gradient-to-br from-[hsl(var(--primary))] to-violet-500 text-[11px] font-semibold text-white">
                                            {initialsOf(user?.name || user?.email || "")}
                                        </span>
                                    )}
                                    <span className="hidden max-w-[140px] truncate sm:block">{user?.name || user?.email}</span>
                                    <ChevronDown className="size-3.5 text-[hsl(var(--muted-foreground))]" />
                                </button>
                                {menuOpen && (
                                    <div
                                        role="menu"
                                        className="absolute right-0 mt-2 w-52 overflow-hidden rounded-xl border border-[hsl(var(--border))]/70 bg-[hsl(var(--popover))] p-1 shadow-xl shadow-black/10"
                                    >
                                        <Link
                                            href="/dashboard?panel=profile"
                                            role="menuitem"
                                            onClick={() => setMenuOpen(false)}
                                            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-2))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]/50"
                                        >
                                            <UserRound className="size-4" />
                                            View profile
                                        </Link>
                                        <button
                                            type="button"
                                            role="menuitem"
                                            onClick={() => {
                                                setMenuOpen(false);
                                                logout();
                                            }}
                                            className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]/50"
                                        >
                                            <LogOut className="size-4" />
                                            Sign out
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex items-center gap-2">
                                <Button variant="ghost" size="sm" asChild>
                                    <Link href="/login">Sign in</Link>
                                </Button>
                                <Button size="sm" asChild>
                                    <Link href="/register">Sign up</Link>
                                </Button>
                            </div>
                        )
                    )}
                </div>
            </div>
        </nav>
    );
};

export default Navbar;
