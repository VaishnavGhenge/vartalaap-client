"use client";

import { PhoneOff, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
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
    const { localStream, initializeCamera, peerConnections } = usePeerStore();
    const { userName, meetCode, clearJoinMeet } = useJoinMeetStore();
    const router = useRouter();

    const [copied, setCopied] = useState(false);

    const remotePeers = useMemo(() => Array.from(peerConnections.values()), [peerConnections]);

    const broadcastState = (audio: boolean, video: boolean) => {
        client?.send('peer-state', { audio, video });
    };

    const handleMicToggle = async () => {
        const nextMuted = !isMuted;
        let stream = localStream;
        const justCreated = !stream;
        if (!stream) {
            stream = await initializeCamera();
            if (!stream) {
                toast.error("Microphone unavailable. Check browser permissions and try again.");
                return;
            }
            stream.getVideoTracks().forEach((t) => { t.enabled = !isVideoOff });
        }
        stream.getAudioTracks().forEach((t) => { t.enabled = !nextMuted });
        if (justCreated) {
            const fresh = stream;
            peerConnections.forEach((c) => {
                try { c.peer.addStream(fresh) } catch (e) { console.error('addStream failed', c.id, e) }
            });
        }
        toggleMute();
        broadcastState(!nextMuted, !isVideoOff);
    };

    const handleCameraToggle = async () => {
        const nextVideoOff = !isVideoOff;
        let stream = localStream;
        const justCreated = !stream;
        if (!stream) {
            stream = await initializeCamera();
            if (!stream) {
                toast.error("Camera unavailable. Check browser permissions and try again.");
                return;
            }
            stream.getAudioTracks().forEach((t) => { t.enabled = !isMuted });
        }
        stream.getVideoTracks().forEach((t) => { t.enabled = !nextVideoOff });
        if (justCreated) {
            const fresh = stream;
            peerConnections.forEach((c) => {
                try { c.peer.addStream(fresh) } catch (e) { console.error('addStream failed', c.id, e) }
            });
        }
        toggleVideo();
        broadcastState(!isMuted, !nextVideoOff);
    };

    const handleCopyCode = async () => {
        try {
            await navigator.clipboard.writeText(meetCode || window.location.href);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            toast.error("Could not copy");
        }
    };

    const handleEndCall = () => {
        clearJoinMeet();
        router.push('/');
    };

    const alone = remotePeers.length === 0;

    return (
        <div className='relative min-h-screen w-full overflow-hidden text-[hsl(var(--foreground))]'>
            {/* Subtle amber vignette */}
            <div className='pointer-events-none absolute inset-0 opacity-[0.07]'
                 style={{ background: 'radial-gradient(60% 50% at 50% 10%, hsl(var(--brand-glow) / 0.34) 0%, transparent 70%)' }} />

            {/* Top bar: meeting code */}
            <div className='absolute left-4 top-4 z-20 flex items-center gap-2'>
                <button
                    type='button'
                    onClick={handleCopyCode}
                    className='press group flex items-center gap-2 rounded-full border border-[hsl(var(--border))]/70 bg-[hsl(var(--surface))]/82 px-3 py-1.5 text-sm backdrop-blur-sm'
                    aria-label='Copy meeting link'
                >
                    <span className='font-mono tracking-wide'>{meetCode || '—'}</span>
                    {copied ? <Check className='w-4 h-4 text-[hsl(var(--brand-glow))]' /> : <Copy className='w-4 h-4 text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--foreground))]' />}
                </button>
            </div>

            <div className='absolute right-4 top-4 z-20 hidden rounded-full border border-[hsl(var(--border))]/70 bg-[hsl(var(--surface))]/82 px-3 py-1.5 text-sm text-[hsl(var(--muted-foreground))] backdrop-blur-sm sm:block'>
                {remotePeers.length + 1} participant{remotePeers.length === 0 ? "" : "s"}
            </div>

            <main className='flex flex-col h-screen'>
                <div className='flex-1 p-4 pb-28 min-h-0'>
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
                    <div className='pointer-events-none absolute inset-x-0 bottom-28 flex justify-center'>
                        <div className='rounded-full border border-[hsl(var(--border))]/70 bg-[hsl(var(--surface))]/78 px-4 py-2 text-sm text-[hsl(var(--muted-foreground))] backdrop-blur-sm'>
                            You&apos;re the only one here — share the code above to invite someone.
                        </div>
                    </div>
                )}

                {/* Floating control bar */}
                <div className='absolute bottom-5 left-1/2 -translate-x-1/2 z-20'>
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
