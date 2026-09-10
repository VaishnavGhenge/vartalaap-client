"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";

export function RouteTransition({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const content = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Room media and its overlays must retain their existing lifecycle.
        if (pathname.startsWith("/room/") || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        const animation = content.current
            ?.querySelector("main")
            ?.animate([{ opacity: 0.94 }, { opacity: 1 }], { duration: 160, easing: "ease-out" });
        return () => animation?.cancel();
    }, [pathname]);

    return (
        <div ref={content} className="min-h-dvh">
            {children}
        </div>
    );
}
