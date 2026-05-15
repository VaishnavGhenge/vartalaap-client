"use client";

import JoinMeet from "@/src/components/features/JoinMeet";
import MeetCall from "@/src/components/features/MeetCall";
import { CallErrorBoundary } from "@/src/components/ui/CallErrorBoundary";
import { useJoinMeetStore } from "@/src/stores/joinMeet";
import { useMeetStore } from "@/src/stores/meet";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { usePeerStore } from "@/src/stores/peer";
import { useSignaling } from "@/src/hooks/use-signaling";
import { useCall } from "@/src/hooks/use-call";
import { useAuth } from "@/src/hooks/use-auth";

export default function MeetManager() {
    const params = useParams<{ meetCode: string }>();
    const meetCode = params.meetCode;
    const { hasJoinedMeet, setMeetCode, setHasJoinedMeet, userName } = useJoinMeetStore();
    const { clearMeet, setCurrentMeet, isMuted, isVideoOff } = useMeetStore();
    const { clearAll } = usePeerStore();
    const { isAuthenticated } = useAuth();

    const { client, connState, reconnectAttempt } = useSignaling(hasJoinedMeet);
    useCall({
        client,
        roomId: meetCode,
        enabled: hasJoinedMeet,
        userName,
        initialAudio: !isMuted,
        initialVideo: !isVideoOff,
        // SFU routes require a JWT — only enable for authenticated users.
        // Unauthenticated / guest participants fall back to P2P signaling.
        sfuEnabled: isAuthenticated,
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

    const handleLeave = () => {
        client?.send('leave', undefined, { room: meetCode });
        clearAll();
        clearMeet();
        setHasJoinedMeet(false);
        setMeetCode("");
    };

    return (
        <div className="flex flex-1 flex-col">
            {hasJoinedMeet
                ? (
                    <CallErrorBoundary onLeave={handleLeave}>
                        <MeetCall
                            client={client}
                            connState={connState}
                            reconnectAttempt={reconnectAttempt}
                            routeMeetCode={meetCode}
                            onLeave={handleLeave}
                        />
                    </CallErrorBoundary>
                )
                : <JoinMeet />}
        </div>
    );
}
