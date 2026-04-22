"use client";

import React from "react";
import Navbar from "@/src/components/ui/Navbar";
import {useJoinMeetStore} from "@/src/stores/joinMeet";

export default function MeetLayout({children,}: { children: React.ReactNode; }) {
    const {hasJoinedMeet} = useJoinMeetStore()

    if (hasJoinedMeet) {
        return <>{children}</>;
    }

    return (
        <div className="flex min-h-screen flex-col">
            <Navbar/>
            <div className="flex flex-1 flex-col">{children}</div>
        </div>
    );
}