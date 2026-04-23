"use client";

import {ReactNode} from "react";

export function HomeWrapper({ children }: { children: ReactNode }) {
    return (
        <div className="app-shell min-h-dvh">
            <div className="min-h-dvh">
                {children}
            </div>
        </div>
    );
}
