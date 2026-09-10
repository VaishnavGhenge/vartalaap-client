"use client";

import {ReactNode} from "react";
import { RouteTransition } from "@/src/components/ui/RouteTransition";

export function HomeWrapper({ children }: { children: ReactNode }) {
    return (
        <div className="app-shell min-h-dvh">
            <RouteTransition>
                {children}
            </RouteTransition>
        </div>
    );
}
