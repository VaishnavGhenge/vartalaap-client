"use client";

import JoinMeet from "@/src/components/features/JoinMeet";
import MeetCall from "@/src/components/features/MeetCall";
import KnockingScreen from "@/src/components/features/KnockingScreen";
import { CallErrorBoundary } from "@/src/components/ui/CallErrorBoundary";
import { useJoinMeetStore } from "@/src/stores/joinMeet";
import { useMeetStore } from "@/src/stores/meet";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/src/components/ui/button";
import { usePeerStore } from "@/src/stores/peer";
import { useSignaling } from "@/src/hooks/use-signaling";
import { useCall } from "@/src/hooks/use-call";
import { exchangeGuestToken } from "@/src/services/api/guestAuth";

export default function MeetManager() {
    const params = useParams<{ meetCode: string }>();
    const meetCode = params.meetCode;
    const [hasLeft, setHasLeft] = useState(false);
    const searchParams = useSearchParams();
    const { hasJoinedMeet, setMeetCode, setHasJoinedMeet, userName } = useJoinMeetStore();
    const { clearMeet, setCurrentMeet, isMuted, isVideoOff, isKnocking } = useMeetStore();

    // If the URL carries ?gt= (guest token from booking email), exchange it for
    // a room-scoped SFU JWT before the user clicks Join. Succeeds silently;
    // on failure the knock/admit flow handles SFU auth instead.
    const guestToken = searchParams.get("gt");
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
        setHasLeft(true);
        client?.send("leave", undefined, { room: meetCode });
        clearAll();
        clearMeet();
        setHasJoinedMeet(false);
        setMeetCode("");
    };

    return (
        <div className="flex flex-1 flex-col">
            {!hasJoinedMeet && !hasLeft && <JoinMeet />}
            {!hasJoinedMeet && hasLeft && (
                <main className="call-stage flex flex-1 items-center justify-center p-6">
                    <div className="experience-card w-full max-w-md p-8 text-center">
                        <h1
                            tabIndex={-1}
                            ref={(element) => {
                                element?.focus();
                            }}
                            className="font-display text-3xl"
                        >
                            You’ve left the call.
                        </h1>
                        <p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">
                            Your camera and microphone are off. You can rejoin if the room is still open.
                        </p>
                        <Button className="mt-6 w-full" onClick={() => setHasLeft(false)}>
                            Rejoin call
                        </Button>
                        <Link className="mt-4 inline-block text-sm text-[hsl(var(--primary))]" href="/">
                            Back to Sessionly
                        </Link>
                    </div>
                </main>
            )}
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
