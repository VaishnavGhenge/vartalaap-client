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

interface MeetCallProps {
    client: SignalingClient | null;
    connState: ConnState;
    reconnectAttempt: number;
    routeMeetCode?: string;
}

export default function MeetCall({ client, connState, reconnectAttempt, routeMeetCode }: MeetCallProps) {
    const { isMuted, isVideoOff, isScreenSharing, toggleMute, toggleVideo, toggleScreenShare, clearMeet } = useMeetStore();
    const { localStream, enableMic, disableMic, enableCamera, disableCamera, switchCamera, startScreenShare, stopScreenShare, peerConnections, peerStats } = usePeerStore();
    const hasMultipleCameras = useHasMultipleCameras();
    const { userName, meetCode, clearJoinMeet } = useJoinMeetStore();

    usePeerStats(client);

    const [copied, setCopied] = useState(false);
    const [canShare, setCanShare] = useState(false);
    const [showStats, setShowStats] = useState(false);
    const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
    // 'browser' | 'window' | 'monitor' | 'unknown'
    // For window/monitor shares the call overlay is hidden from the DOM entirely
    // so it doesn't appear in the capture.
    const [screenSurface, setScreenSurface] = useState<string>('unknown');
    const screenTrackRef = useRef<MediaStreamTrack | null>(null);
    useEffect(() => { setCanShare('share' in navigator); }, []);

    const remotePeers = useMemo(() => Array.from(peerConnections.values()), [peerConnections]);

    const broadcastState = (audio: boolean, video: boolean, speaking?: boolean) => {
        client?.send('peer-state', { audio, video, speaking });
    };

    // Detect local speaking and broadcast so remote peers can show the ring.
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
        setScreenStream(null);
        setScreenSurface('unknown');
        stopScreenShare();
        if (isScreenSharing) toggleScreenShare();
    };

    const handleScreenShare = async () => {
        if (isScreenSharing) {
            doStopScreenShare();
            return;
        }
        const result = await startScreenShare();
        if (!result) return;
        const { track, surface } = result;
        screenTrackRef.current = track;
        const stream = new MediaStream([track]);
        setScreenStream(stream);
        setScreenSurface(surface);
        toggleScreenShare();
        // Auto-stop when the user clicks the browser's "Stop sharing" button.
        track.addEventListener('ended', doStopScreenShare, { once: true });
    };

    const handleEndCall = () => {
        screenTrackRef.current?.stop();
        screenTrackRef.current = null;
        playLeaveCall();
        clearMeet();
        clearJoinMeet();
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

    return (
        <div className="relative min-h-dvh w-full overflow-hidden text-[hsl(var(--foreground))]">

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

                <div className="glass-pill px-3 py-1.5 text-xs text-[hsl(var(--muted-foreground))]">
                    {participantCount} {participantCount === 1 ? 'participant' : 'participants'}
                </div>
            </div>

            {/* ── Video grid ───────────────────────────────────────────── */}
            <main className="flex flex-col h-dvh">
                {isScreenSharing ? (
                    /* ── Screen-share layout ─────────────────────────────
                       Mirror prevention strategy by surface type:
                       - 'browser' (tab): selfBrowserSurface:exclude already
                         removed this tab from the picker — no mirror possible.
                       - 'window' / 'monitor': ANY element on this page will
                         appear in the capture, so we remove the participant
                         strip from the DOM entirely. The control bar stays
                         (user can drag the browser window so controls are
                         off-screen, or accept that only the bar is captured).
                       - 'unknown' (Firefox/Safari): treat conservatively,
                         same as window/monitor.
                    ─────────────────────────────────────────────────────── */
                    <div className="flex-1 relative min-h-0"
                         style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))' }}>
                        {/* Screen preview — fills the frame */}
                        {screenStream && (
                            <video
                                ref={(el) => { if (el && el.srcObject !== screenStream) { el.srcObject = screenStream; el.play().catch(() => {}); } }}
                                muted
                                playsInline
                                className="absolute inset-0 w-full h-full object-contain bg-black rounded-2xl"
                                aria-label="Screen share preview"
                            />
                        )}
                        {/* Participant strip — only rendered for tab captures.
                            For window/monitor captures it's omitted from the DOM
                            to prevent it from appearing in the shared content. */}
                        {screenSurface === 'browser' && remotePeers.length > 0 && (
                            <div className="absolute top-3 right-3 z-10 flex flex-col gap-2"
                                 style={{ width: 'clamp(100px, 18vw, 160px)' }}>
                                {remotePeers.map((c) => {
                                    const stats = peerStats.get(c.id);
                                    return (
                                        <div key={c.id} style={{ aspectRatio: '16/9' }}>
                                            <VideoTile
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
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                ) : (
                    /* ── Normal grid layout ─────────────────────────────── */
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
                            {remotePeers.map((c) => {
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
                                    />
                                );
                            })}
                        </VideoGrid>
                    </div>
                )}

                {alone && !isScreenSharing && (
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
                    {hasMultipleCameras && !isVideoOff && (
                        <FlipCameraButton onClickFn={handleFlipCamera} />
                    )}

                    <button
                        type="button"
                        onClick={handleScreenShare}
                        aria-label={isScreenSharing ? "Stop sharing screen" : "Share screen"}
                        className={`ctrl-btn h-9 w-9 sm:h-11 sm:w-11 ${isScreenSharing ? "ctrl-btn-screen" : "ctrl-btn-on"}`}
                    >
                        <Monitor className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>

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
