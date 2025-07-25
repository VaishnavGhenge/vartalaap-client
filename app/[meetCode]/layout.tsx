"use client";

import React from "react";
import Navbar from "@/src/components/ui/Navbar";
import {useJoinMeetStore} from "@/src/stores/joinMeet";

export default function MeetLayout({children,}: { children: React.ReactNode; }) {
    const {hasJoinedMeet} = useJoinMeetStore()

    return <>
        {!hasJoinedMeet && <Navbar/>}
        {children}
    </>
}