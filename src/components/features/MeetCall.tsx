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
            if (!track) {
                toast.error("Microphone unavailable. Check browser permissions and try again.");
                return;
            }
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
            if (!track) {
                toast.error("Camera unavailable. Check browser permissions and try again.");
                return;
            }
        }
        toggleVideo();
        broadcastState(!isMuted, !nextVideoOff);
    };

    const handleCopyCode = async () => {
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

    return (
        <div className='relative min-h-dvh w-full overflow-hidden text-[hsl(var(--foreground))]'>
            {/* Subtle amber vignette */}
            <div className='pointer-events-none absolute inset-0 opacity-[0.07]'
                 style={{ background: 'radial-gradient(60% 50% at 50% 10%, hsl(var(--brand-glow) / 0.34) 0%, transparent 70%)' }} />

            {/* Top bar: meeting code */}
            <div className='absolute left-4 top-4 z-20 flex items-center gap-2'>
                <button
                    type='button'
                    onClick={handleCopyCode}
                    className='press group flex items-center gap-2 rounded-full border border-[hsl(var(--border))]/70 bg-[hsl(var(--surface))]/82 px-3 py-1.5 text-sm backdrop-blur-sm'
                    aria-label={canShare ? 'Share meeting' : 'Copy meeting code'}
                >
                    <span className='font-mono tracking-wide'>{meetCode || '—'}</span>
                    {copied
                        ? <Check className='w-4 h-4 text-[hsl(var(--brand-glow))]' />
                        : canShare
                            ? <Share2 className='w-4 h-4 text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--foreground))]' />
                            : <Copy className='w-4 h-4 text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--foreground))]' />
                    }
                </button>
            </div>

            <div className='absolute right-4 top-4 z-20 rounded-full border border-[hsl(var(--border))]/70 bg-[hsl(var(--surface))]/82 px-3 py-1.5 text-xs sm:text-sm text-[hsl(var(--muted-foreground))] backdrop-blur-sm'>
                {remotePeers.length + 1} participant{remotePeers.length === 0 ? "" : "s"}
            </div>

            <main className='flex flex-col h-dvh'>
                <div className='flex-1 p-4 min-h-0' style={{ paddingBottom: 'calc(7rem + env(safe-area-inset-bottom, 0px))' }}>
                    <VideoGrid gap={12} tileAspect={16 / 9}>
                        <VideoTile
                            key='local'
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

                {alone && (
                    <div className='pointer-events-none absolute inset-x-0 flex justify-center' style={{ bottom: 'calc(7rem + env(safe-area-inset-bottom, 0px))' }}>
                        <div className='rounded-full border border-[hsl(var(--border))]/70 bg-[hsl(var(--surface))]/78 px-4 py-2 text-sm text-[hsl(var(--muted-foreground))] backdrop-blur-sm'>
                            You&apos;re the only one here — share the code above to invite someone.
                        </div>
                    </div>
                )}

                {/* Floating control bar */}
                <div className='absolute left-1/2 -translate-x-1/2 z-20' style={{ bottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}>
                    <div className='flex items-center gap-2 rounded-full border border-[hsl(var(--border))]/70 bg-[hsl(var(--surface))]/82 px-2 py-2 shadow-2xl shadow-[hsl(var(--shadow-color))]/35 backdrop-blur-md'>
                        <MicButton
                            onClickFn={handleMicToggle}
                            action={isMuted ? "close" : "open"}
                        />
                        <CameraButton
                            onClickFn={handleCameraToggle}
                            action={isVideoOff ? "close" : "open"}
                        />
                        <div className='mx-1 h-6 w-px bg-[hsl(var(--border))]' />
                        <button
                            type='button'
                            onClick={handleEndCall}
                            aria-label='Leave call'
                            className='press flex h-11 items-center gap-2 rounded-full bg-[hsl(var(--destructive))] pl-4 pr-5 text-[hsl(var(--destructive-foreground))] shadow-lg shadow-[hsl(var(--destructive))]/30 hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--destructive))]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--surface))]'
                        >
                            <PhoneOff className='w-5 h-5' />
                            <span className='text-sm font-medium'>Leave</span>
                        </button>
                    </div>
                </div>
            </main>
        </div>
    );
}
