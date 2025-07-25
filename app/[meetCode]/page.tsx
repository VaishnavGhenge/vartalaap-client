"use client";

import JoinMeet from "@/src/components/features/JoinMeet";
import {useEffect, useState} from "react";
import {Meet} from "@/src/services/webrtc/webrtc";

export default function MeetManager({params}: { params: { meetCode: string } }) {
    const [meetState, setMeet] = useState<Meet | null>(null);

    useEffect(() => {
        const meetId = window.sessionStorage.getItem("meetId");
        const sessionId = window.sessionStorage.getItem("sessionId");

        if (!meetId || !sessionId) {
            console.log("No meetId or sessionId available in sessionStorage page.tsx");
            return;
        }

        const meet = Meet.getInstance(meetId, sessionId);
        setMeet(meet);

        return () => {
            meet.leaveMeet();
        }
    }, []);

    return <JoinMeet></JoinMeet>
}
