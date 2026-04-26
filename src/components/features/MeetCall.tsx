"use client";

import { PhoneOff, Copy, Check, Share2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { MicButton } from "@/src/components/ui/MicButton";
import { CameraButton } from "@/src/components/ui/CameraButton";
import { VideoTile } from "@/src/components/ui/VideoTile";
import { VideoGrid } from "@/src/components/ui/VideoGrid";
import { useMeetStore } from "@/src/stores/meet";
import { usePeerStore } from "@/src/stores/peer";
import { useJoinMeetStore } from "@/src/stores/joinMeet";
import type { SignalingClient } from "@/src/services/signaling/client";

interface MeetCallProps {
    client: SignalingClient | null;
}

export default function MeetCall({ client }: MeetCallProps) {
    const { isMuted, isVideoOff, toggleMute, toggleVideo } = useMeetStore();
    const { localStream, enableMic, disableMic, enableCamera, disableCamera, peerConnections } = usePeerStore();
    const { userName, meetCode, clearJoinMeet } = useJoinMeetStore();
    const router = useRouter();

    const [copied, setCopied] = useState(false);
    const [canShare, setCanShare] = useState(false);
    useEffect(() => { setCanShare('share' in navigator); }, []);

    const remotePeers = useMemo(() => Array.from(peerConnections.values()), [peerConnections]);

    const broadcastState = (audio: boolean, video: boolean) => {
        client?.send('peer-state', { audio, video });
    };

    const handleMicToggle = async () => {
        const nextMuted = !isMuted;
        if (nextMuted) {
            disableMic();
        } else {
            const track = await enableMic();
            if (!track) { toast.error("Microphone unavailable. Check browser permissions."); return; }
        }
        toggleMute();
        broadcastState(!nextMuted, !isVideoOff);
    };

    const handleCameraToggle = async () => {
        const nextVideoOff = !isVideoOff;
        if (nextVideoOff) {
            disableCamera();
        } else {
            const track = await enableCamera();
            if (!track) { toast.error("Camera unavailable. Check browser permissions."); return; }
        }
        toggleVideo();
        broadcastState(!isMuted, !nextVideoOff);
    };

    const handleShare = async () => {
        try {
            if (canShare) {
                await navigator.share({ title: 'Join my Vartalaap call', url: window.location.href });
            } else {
                await navigator.clipboard.writeText(window.location.href);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
            }
        } catch (e) {
            if ((e as Error).name !== 'AbortError') toast.error("Could not share");
        }
    };

    const handleEndCall = () => {
        clearJoinMeet();
        router.push('/');
    };

    const alone = remotePeers.length === 0;
    const participantCount = remotePeers.length + 1;

    return (
        <div className="relative min-h-dvh w-full overflow-hidden text-[hsl(var(--foreground))]">

            {/* ── Top bar ──────────────────────────────────────────────── */}
            <div className="absolute left-4 top-4 right-4 z-20 flex items-center justify-between gap-3">
                {/* Share button */}
                <button
                    type="button"
                    onClick={handleShare}
                    aria-label={canShare ? 'Share meeting' : 'Copy meeting link'}
                    className="press glass-pill gap-2 px-3 py-1.5 text-sm
                               hover:bg-[hsl(var(--surface-2))] transition-colors"
                >
                    <span className="meet-code">{meetCode || '—'}</span>
                    {copied
                        ? <Check className="w-3.5 h-3.5 text-[hsl(var(--primary))]" />
                        : canShare
                            ? <Share2 className="w-3.5 h-3.5 text-[hsl(var(--muted-foreground))]" />
                            : <Copy className="w-3.5 h-3.5 text-[hsl(var(--muted-foreground))]" />
                    }
                </button>

                {/* Participant count */}
                <div className="glass-pill px-3 py-1.5 text-xs text-[hsl(var(--muted-foreground))]">
                    {participantCount} {participantCount === 1 ? 'participant' : 'participants'}
                </div>
            </div>

            {/* ── Video grid ───────────────────────────────────────────── */}
            <main className="flex flex-col h-dvh">
                <div className="flex-1 p-3 min-h-0"
                     style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))' }}>
                    <VideoGrid gap={8} tileAspect={16 / 9}>
                        <VideoTile
                            key="local"
                            isLocal
                            userName={userName}
                            isVideoOff={isVideoOff}
                            isMuted={isMuted}
                            stream={localStream}
                        />
                        {remotePeers.map((c) => (
                            <VideoTile
                                key={c.id}
                                participant={{
                                    id: c.id,
                                    name: c.name || c.id.slice(0, 6),
                                    isMuted: !c.audio,
                                    isVideoOff: !c.video,
                                }}
                                stream={c.stream ?? null}
                            />
                        ))}
                    </VideoGrid>
                </div>

                {/* Waiting hint */}
                {alone && (
                    <div className="pointer-events-none absolute inset-x-0 flex justify-center px-4"
                         style={{ bottom: 'calc(5.5rem + env(safe-area-inset-bottom, 0px))' }}>
                        <p className="glass-pill px-4 py-2 text-xs text-[hsl(var(--muted-foreground))]">
                            Share the code above to invite someone
                        </p>
                    </div>
                )}
            </main>

            {/* ── Floating control bar ──────────────────────────────────── */}
            <div className="absolute left-1/2 -translate-x-1/2 z-20"
                 style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
                <div className="glass-pill gap-2 px-2 py-2 shadow-xl shadow-[hsl(var(--shadow-color))]/25">
                    <MicButton onClickFn={handleMicToggle} action={isMuted ? "close" : "open"} />
                    <CameraButton onClickFn={handleCameraToggle} action={isVideoOff ? "close" : "open"} />

                    <div className="mx-1 h-5 w-px bg-[hsl(var(--border))]" />

                    <button
                        type="button"
                        onClick={handleEndCall}
                        aria-label="Leave call"
                        className="ctrl-btn ctrl-btn-off h-9 w-9 sm:h-11 sm:w-11"
                    >
                        <PhoneOff className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                </div>
            </div>
        </div>
    );
}
