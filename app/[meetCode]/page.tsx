"use client";

import JoinMeet from "@/src/components/features/JoinMeet";
import MeetCall from "@/src/components/features/MeetCall";
import { useJoinMeetStore } from "@/src/stores/joinMeet";
import { useMeetStore } from "@/src/stores/meet";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { usePeerStore } from "@/src/stores/peer";

export default function MeetManager() {
    const params = useParams<{meetCode: string}>();
    const { hasJoinedMeet, setMeetCode } = useJoinMeetStore();
    const { setCurrentMeet } = useMeetStore();
    const { clearAll } = usePeerStore();
    
    useEffect(() => {
        if (params.meetCode) {
            setMeetCode(params.meetCode);
            setCurrentMeet(params.meetCode);
        }
    }, [params.meetCode, setMeetCode, setCurrentMeet]);
    
    useEffect(() => {
        return () => {
            clearAll();
        };
    }, [clearAll]);
    
    return (
        <div>
            {hasJoinedMeet ? <MeetCall /> : <JoinMeet />}
        </div>
    );
}
