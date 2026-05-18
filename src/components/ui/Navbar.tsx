'use client'

import Link from "next/link";
import AppTitle from "./AppTitle";
import { Button } from "@/src/components/ui/button";
import { useAuth, useLogout } from "@/src/hooks/use-auth";

const Navbar = () => {
    const { user, isAuthenticated, isLoading } = useAuth();
    const logout = useLogout();

    return (
        <nav className="sticky top-0 z-40 w-full border-b border-[hsl(var(--border))]/60 bg-[hsl(var(--background))]/80 backdrop-blur-xl">
            <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
                <AppTitle />

                <div className="flex items-center gap-2">
                    {!isLoading && (
                        isAuthenticated ? (
                            <div className="flex items-center gap-3">
                                <span className="hidden sm:block text-sm text-[hsl(var(--muted-foreground))] truncate max-w-[160px]">
                                    {user?.name}
                                </span>
                                <Button variant="ghost" size="sm" onClick={logout}>
                                    Sign out
                                </Button>
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
