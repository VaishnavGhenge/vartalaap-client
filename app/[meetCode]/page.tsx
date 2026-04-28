"use client";

import JoinMeet from "@/src/components/features/JoinMeet";
import MeetCall from "@/src/components/features/MeetCall";
import { useJoinMeetStore } from "@/src/stores/joinMeet";
import { useMeetStore } from "@/src/stores/meet";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { usePeerStore } from "@/src/stores/peer";
import { useSignaling } from "@/src/hooks/use-signaling";
import { useCall } from "@/src/hooks/use-call";

export default function MeetManager() {
    const params = useParams<{ meetCode: string }>();
    const meetCode = params.meetCode;
    const { hasJoinedMeet, setMeetCode, setHasJoinedMeet, userName } = useJoinMeetStore();
    const { clearMeet, setCurrentMeet, isMuted, isVideoOff } = useMeetStore();
    const { clearAll } = usePeerStore();

    const { client, connState, reconnectAttempt } = useSignaling();
    useCall({
        client,
        roomId: meetCode,
        enabled: hasJoinedMeet,
        userName,
        initialAudio: !isMuted,
        initialVideo: !isVideoOff,
    });

    useEffect(() => {
        if (meetCode) {
            setMeetCode(meetCode);
            setCurrentMeet(meetCode);
        }
    }, [meetCode, setMeetCode, setCurrentMeet]);

    useEffect(() => {
        return () => {
            clearAll();
            clearMeet();
            setHasJoinedMeet(false);
            setMeetCode("");
        };
    }, [clearAll, clearMeet, setHasJoinedMeet, setMeetCode]);

    return (
        <div className="flex flex-1 flex-col">
            {hasJoinedMeet
                ? <MeetCall client={client} connState={connState} reconnectAttempt={reconnectAttempt} routeMeetCode={meetCode} />
                : <JoinMeet />}
        </div>
    );
}
