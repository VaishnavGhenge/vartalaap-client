"use client";

import JoinMeet from "@/src/components/features/JoinMeet";
import MeetCall from "@/src/components/features/MeetCall";
import KnockingScreen from "@/src/components/features/KnockingScreen";
import { CallErrorBoundary } from "@/src/components/ui/CallErrorBoundary";
import { useJoinMeetStore } from "@/src/stores/joinMeet";
import { useMeetStore } from "@/src/stores/meet";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { usePeerStore } from "@/src/stores/peer";
import { useSignaling } from "@/src/hooks/use-signaling";
import { useCall } from "@/src/hooks/use-call";
import { exchangeGuestToken } from "@/src/services/api/guestAuth";

export default function MeetManager() {
    const params = useParams<{ meetCode: string }>();
    const meetCode = params.meetCode;
    const searchParams = useSearchParams();
    const { hasJoinedMeet, setMeetCode, setHasJoinedMeet, userName } = useJoinMeetStore();
    const { clearMeet, setCurrentMeet, isMuted, isVideoOff, isKnocking } = useMeetStore();

    // If the URL carries ?gt= (guest token from booking email), exchange it for
    // a room-scoped SFU JWT before the user clicks Join. Succeeds silently;
    // on failure the knock/admit flow handles SFU auth instead.
    const guestToken = searchParams.get('gt');
    useEffect(() => {
        if (guestToken && meetCode) {
            exchangeGuestToken(meetCode, guestToken).catch(() => undefined);
        }
    }, [guestToken, meetCode]);
    const { clearAll } = usePeerStore();

    const { client, connState, reconnectAttempt } = useSignaling(hasJoinedMeet);
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

    const handleLeave = () => {
        client?.send('leave', undefined, { room: meetCode });
        clearAll();
        clearMeet();
        setHasJoinedMeet(false);
        setMeetCode("");
    };

    return (
        <div className="flex flex-1 flex-col">
            {!hasJoinedMeet && <JoinMeet />}
            {/* While knocking, MeetCall must NOT mount: the signaling `joined`
                ack already populated the peer list, and rendering the grid
                behind a translucent overlay leaks the room's identity (names,
                count, who's sharing) to an unadmitted guest. */}
            {hasJoinedMeet && isKnocking && <KnockingScreen onCancel={handleLeave} />}
            {hasJoinedMeet && !isKnocking && (
                <CallErrorBoundary onLeave={handleLeave}>
                    <MeetCall
                        client={client}
                        connState={connState}
                        reconnectAttempt={reconnectAttempt}
                        routeMeetCode={meetCode}
                        onLeave={handleLeave}
                    />
                </CallErrorBoundary>
            )}
        </div>
    );
}
