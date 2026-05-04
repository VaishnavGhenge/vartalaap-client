"use client";

import { PhoneOff, Copy, Check, Share2, BarChart2, Monitor } from "lucide-react";
import { toast } from "sonner";
import { resumeSharedAudioContext } from "@/src/lib/audio-context";
import { playLeaveCall } from "@/src/lib/sounds";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAudioLevel } from "@/src/hooks/use-audio-level";
import { MicButton } from "@/src/components/ui/MicButton";
import { CameraButton } from "@/src/components/ui/CameraButton";
import { FlipCameraButton } from "@/src/components/ui/FlipCameraButton";
import { useFeatureFlags } from "@/src/hooks/use-feature-flags";
import { useHasMultipleCameras } from "@/src/hooks/use-has-multiple-cameras";
import { VideoTile } from "@/src/components/ui/VideoTile";
import { VideoGrid } from "@/src/components/ui/VideoGrid";
import { ConnectionBanner } from "@/src/components/ui/ConnectionBanner";
import { StatsPanel } from "@/src/components/ui/StatsPanel";
import { useMeetStore } from "@/src/stores/meet";
import { usePeerStore } from "@/src/stores/peer";
import { useJoinMeetStore } from "@/src/stores/joinMeet";
import { usePeerStats } from "@/src/hooks/use-peer-stats";
import type { SignalingClient, ConnState } from "@/src/services/signaling/client";

// Sentinel used for the local tile pin ID
const LOCAL_TILE_ID = 'local'

interface MeetCallProps {
    client: SignalingClient | null;
    connState: ConnState;
    reconnectAttempt: number;
    routeMeetCode?: string;
}

export default function MeetCall({ client, connState, reconnectAttempt, routeMeetCode }: MeetCallProps) {
    const flags = useFeatureFlags();
    const { isMuted, isVideoOff, isScreenSharing, toggleMute, toggleVideo, toggleScreenShare, clearMeet } = useMeetStore();
    const { localStream, screenTrack, enableMic, disableMic, enableCamera, disableCamera, switchCamera, startScreenShare, stopScreenShare, peerConnections, peerStats } = usePeerStore();
    const hasMultipleCameras = useHasMultipleCameras();
    const { userName, meetCode, clearJoinMeet } = useJoinMeetStore();

    usePeerStats(client);

    const [copied, setCopied] = useState(false);
    const [canShare, setCanShare] = useState(false);
    const [showStats, setShowStats] = useState(false);
    const [pinnedId, setPinnedId] = useState<string | null>(null);
    // Briefly blanks the page while the OS picker is open so that if the user
    // picks "Entire Screen" or the app window, capture starts on a blank view
    // rather than the live call UI (prevents the infinite mirror effect).
    const [isPicking, setIsPicking] = useState(false);
    const screenTrackRef = useRef<MediaStreamTrack | null>(null);
    useEffect(() => { setCanShare('share' in navigator); }, []);

    const remotePeers = useMemo(() => Array.from(peerConnections.values()), [peerConnections]);

    // Clear pin when the pinned peer leaves the call.
    useEffect(() => {
        if (!pinnedId || pinnedId === LOCAL_TILE_ID) return;
        if (!peerConnections.has(pinnedId)) setPinnedId(null);
    }, [peerConnections, pinnedId]);

    // While screen sharing, wrap the screen track in its own MediaStream so the
    // local tile shows what remote peers are actually receiving.
    const localDisplayStream = useMemo(() => {
        if (!screenTrack) return localStream;
        const s = new MediaStream();
        s.addTrack(screenTrack);
        return s;
    }, [screenTrack, localStream]);

    const broadcastState = (audio: boolean, video: boolean, speaking?: boolean) => {
        client?.send('peer-state', { audio, video, speaking });
    };

    const localSpeaking = useAudioLevel(localStream, !isMuted);
    const prevSpeakingRef = useRef(localSpeaking);
    useEffect(() => {
        if (prevSpeakingRef.current === localSpeaking) return;
        prevSpeakingRef.current = localSpeaking;
        broadcastState(!isMuted, !isVideoOff, localSpeaking);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [localSpeaking]);

    const handleMicToggle = async () => {
        const nextMuted = !isMuted;
        if (nextMuted) {
            disableMic();
        } else {
            resumeSharedAudioContext();
            const track = await enableMic();
            if (!track) { toast.error("Microphone unavailable. Check browser permissions."); return; }
        }
        toggleMute();
        broadcastState(!nextMuted, !isVideoOff, nextMuted ? false : undefined);
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

    const handleFlipCamera = async () => {
        const ok = await switchCamera();
        if (!ok) toast.error("Could not switch camera.");
    };

    const doStopScreenShare = () => {
        screenTrackRef.current?.stop();
        screenTrackRef.current = null;
        stopScreenShare();
        if (isScreenSharing) toggleScreenShare();
    };

    const handleScreenShare = async () => {
        if (isScreenSharing) {
            doStopScreenShare();
            return;
        }
        // Blank the page before the OS picker opens so any "Entire Screen" or
        // window capture starts on a blank background, not the live call UI.
        setIsPicking(true);
        const track = await startScreenShare();
        setIsPicking(false);
        if (!track) return;
        screenTrackRef.current = track;
        toggleScreenShare();
        track.addEventListener('ended', doStopScreenShare, { once: true });
    };

    const handleEndCall = () => {
        screenTrackRef.current?.stop();
        screenTrackRef.current = null;
        playLeaveCall();
        clearMeet();
        clearJoinMeet();
    };

    const togglePin = (id: string) => {
        setPinnedId(prev => prev === id ? null : id);
    };

    const alone = remotePeers.length === 0;
    const participantCount = remotePeers.length + 1;
    const displayMeetCode = meetCode || routeMeetCode || '—';

    const statsRows = useMemo(
        () => remotePeers.map((c) => ({
            id: c.id,
            name: c.name || c.id.slice(0, 8),
            stats: peerStats.get(c.id) ?? {
                outboundBitrateKbps: 0,
                inboundBitrateKbps: 0,
                packetLossPercent: 0,
                roundTripTimeMs: -1,
                jitterMs: 0,
                candidateType: 'unknown' as const,
                quality: 'unknown' as const,
                encodingLevel: 2 as const,
                timestamp: 0,
            },
        })),
        [remotePeers, peerStats],
    );

    // ── Spotlight helpers ─────────────────────────────────────────────────────

    const renderLocalTile = (opts: { onPin?: () => void; isPinned?: boolean } = {}) => (
        <VideoTile
            key="local"
            isLocal
            userName={userName}
            isVideoOff={isScreenSharing ? false : isVideoOff}
            isMuted={isMuted}
            stream={localDisplayStream}
            onPin={opts.onPin}
            isPinned={opts.isPinned}
        />
    );

    const renderRemoteTile = (c: typeof remotePeers[number], opts: { onPin?: () => void; isPinned?: boolean } = {}) => {
        const stats = peerStats.get(c.id);
        return (
            <VideoTile
                key={c.id}
                participant={{
                    id: c.id,
                    name: c.name || c.id.slice(0, 6),
                    isMuted: !c.audio,
                    isVideoOff: !c.video,
                    speaking: c.speaking,
                }}
                stream={c.stream ?? null}
                quality={stats?.quality}
                viaRelay={stats?.candidateType === 'relay'}
                onPin={opts.onPin}
                isPinned={opts.isPinned}
            />
        );
    };

    // ── Determine if spotlight mode is active ─────────────────────────────────

    const pinnedPeer = pinnedId && pinnedId !== LOCAL_TILE_ID
        ? remotePeers.find(c => c.id === pinnedId) ?? null
        : null;
    const spotlightActive = pinnedId !== null && (pinnedId === LOCAL_TILE_ID || pinnedPeer !== null);

    // Tiles that go in the thumbnail strip (everyone except the pinned tile)
    const stripPeers = spotlightActive
        ? remotePeers.filter(c => c.id !== pinnedId)
        : [];
    const localInStrip = spotlightActive && pinnedId !== LOCAL_TILE_ID;

    return (
        <div className="relative min-h-dvh w-full overflow-hidden text-[hsl(var(--foreground))]">

            {/* Brief blank overlay while the OS screen-picker is open. */}
            {isPicking && (
                <div
                    className="fixed inset-0 z-[999] bg-[hsl(var(--background))]"
                    aria-hidden="true"
                />
            )}

            <ConnectionBanner
                connState={connState}
                reconnectAttempt={reconnectAttempt}
                onLeave={handleEndCall}
            />

            {/* ── Top bar ──────────────────────────────────────────────── */}
            <div className="absolute left-4 top-4 right-4 z-20 flex items-center justify-between gap-3">
                <button
                    type="button"
                    onClick={handleShare}
                    aria-label={canShare ? 'Share meeting' : 'Copy meeting link'}
                    className="press glass-pill gap-2 px-3 py-1.5 text-sm
                               hover:bg-[hsl(var(--surface-2))] transition-colors"
                >
                    <span className="meet-code">{displayMeetCode}</span>
                    {copied
                        ? <Check className="w-3.5 h-3.5 text-[hsl(var(--primary))]" />
                        : canShare
                            ? <Share2 className="w-3.5 h-3.5 text-[hsl(var(--muted-foreground))]" />
                            : <Copy className="w-3.5 h-3.5 text-[hsl(var(--muted-foreground))]" />
                    }
                </button>

                <div className="flex items-center gap-2">
                    {flags.screen_sharing && isScreenSharing && (
                        <div className="glass-pill gap-1.5 px-3 py-1.5 text-xs font-medium
                                        text-[hsl(var(--primary))]">
                            <Monitor className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                            Presenting
                        </div>
                    )}
                    <div className="glass-pill px-3 py-1.5 text-xs text-[hsl(var(--muted-foreground))]">
                        {participantCount} {participantCount === 1 ? 'participant' : 'participants'}
                    </div>
                </div>
            </div>

            {/* ── Main content area ────────────────────────────────────── */}
            <main className="flex flex-col h-dvh">
                {spotlightActive ? (
                    // ── Spotlight layout ────────────────────────────────
                    <>
                        {/* Large pinned tile */}
                        <div
                            className="flex-1 p-3 min-h-0"
                            style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom, 0px) + 88px)' }}
                        >
                            <div className="w-full h-full">
                                {pinnedId === LOCAL_TILE_ID
                                    ? renderLocalTile({ onPin: () => togglePin(LOCAL_TILE_ID), isPinned: true })
                                    : pinnedPeer && renderRemoteTile(pinnedPeer, { onPin: () => togglePin(pinnedId!), isPinned: true })
                                }
                            </div>
                        </div>

                        {/* Thumbnail strip — above the control bar */}
                        <div
                            className="absolute left-0 right-0 z-10 px-3 flex gap-2 overflow-x-auto"
                            style={{ bottom: 'calc(5.5rem + env(safe-area-inset-bottom, 0px))', height: '80px' }}
                        >
                            {localInStrip && (
                                <div className="shrink-0 rounded-xl overflow-hidden" style={{ width: '142px', height: '80px' }}>
                                    {renderLocalTile({ onPin: () => togglePin(LOCAL_TILE_ID), isPinned: false })}
                                </div>
                            )}
                            {stripPeers.map(c => (
                                <div key={c.id} className="shrink-0 rounded-xl overflow-hidden" style={{ width: '142px', height: '80px' }}>
                                    {renderRemoteTile(c, { onPin: () => togglePin(c.id), isPinned: false })}
                                </div>
                            ))}
                        </div>
                    </>
                ) : (
                    // ── Normal grid layout ──────────────────────────────
                    <div className="flex-1 p-3 min-h-0"
                         style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))' }}>
                        <VideoGrid gap={8} tileAspect={16 / 9}>
                            {renderLocalTile({ onPin: remotePeers.length > 0 ? () => togglePin(LOCAL_TILE_ID) : undefined })}
                            {remotePeers.map((c) => renderRemoteTile(c, { onPin: () => togglePin(c.id) }))}
                        </VideoGrid>
                    </div>
                )}

                {alone && (
                    <div className="pointer-events-none absolute inset-x-0 flex justify-center px-4"
                         style={{ bottom: 'calc(5.5rem + env(safe-area-inset-bottom, 0px))' }}>
                        <p className="glass-pill px-4 py-2 text-xs text-[hsl(var(--muted-foreground))]">
                            Share the code above to invite someone
                        </p>
                    </div>
                )}
            </main>

            {/* ── Floating control bar ─────────────────────────────────── */}
            <div className="absolute left-1/2 -translate-x-1/2 z-20"
                 style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
                <div className="glass-pill gap-2 px-2 py-2 shadow-xl shadow-[hsl(var(--shadow-color))]/25">
                    <MicButton onClickFn={handleMicToggle} action={isMuted ? "close" : "open"} />
                    <CameraButton onClickFn={handleCameraToggle} action={isVideoOff ? "close" : "open"} />
                    {hasMultipleCameras && !isVideoOff && !isScreenSharing && (
                        <FlipCameraButton onClickFn={handleFlipCamera} />
                    )}

                    {flags.screen_sharing && (
                        <button
                            type="button"
                            onClick={handleScreenShare}
                            aria-label={isScreenSharing ? "Stop sharing screen" : "Share screen"}
                            className={`ctrl-btn h-9 w-9 sm:h-11 sm:w-11 ${isScreenSharing ? 'ctrl-btn-screen' : 'ctrl-btn-on'}`}
                        >
                            <Monitor className="w-4 h-4 sm:w-5 sm:h-5" />
                        </button>
                    )}

                    <div className="mx-1 h-5 w-px bg-[hsl(var(--border))]" />

                    <button
                        type="button"
                        onClick={() => setShowStats(true)}
                        aria-label="Network stats"
                        className="ctrl-btn ctrl-btn-on h-9 w-9 sm:h-11 sm:w-11"
                    >
                        <BarChart2 className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>

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

            {showStats && (
                <StatsPanel rows={statsRows} onClose={() => setShowStats(false)} />
            )}
        </div>
    );
}
