"use client";

import {ReactNode} from "react";

export function HomeWrapper({ children }: { children: ReactNode }) {
    return (
        <div className="app-shell min-h-screen">
            <div className="min-h-screen">
                {children}
            </div>
        </div>
    );
}
