"use client";

import { PhoneOff, Copy, Check, Share2, BarChart2, Monitor, PictureInPicture2 } from "lucide-react";
import { toast } from "sonner";
import { resumeSharedAudioContext } from "@/src/lib/audio-context";
import { playLeaveCall, playScreenShareStart, playScreenShareStop } from "@/src/lib/sounds";
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
import { PipWindow } from "@/src/components/ui/PipWindow";
import { usePip } from "@/src/hooks/use-pip";
import { useMeetStore } from "@/src/stores/meet";
import { usePeerStore } from "@/src/stores/peer";
import { useJoinMeetStore } from "@/src/stores/joinMeet";
import { usePeerStats } from "@/src/hooks/use-peer-stats";
import type { SignalingClient, ConnState } from "@/src/services/signaling/client";

const LOCAL_TILE_ID = 'local'

interface MeetCallProps {
    client: SignalingClient | null;
    connState: ConnState;
    reconnectAttempt: number;
    routeMeetCode?: string;
}

export default function MeetCall({ client, connState, reconnectAttempt, routeMeetCode }: MeetCallProps) {
    const { isMuted, isVideoOff, isScreenSharing, toggleMute, toggleVideo, toggleScreenShare, clearMeet } = useMeetStore();
    const { localStream, screenTrack, enableMic, disableMic, enableCamera, disableCamera, switchCamera, startScreenShare, stopScreenShare, peerConnections, peerStats } = usePeerStore();
    const hasMultipleCameras = useHasMultipleCameras();
    const { userName, meetCode, clearJoinMeet } = useJoinMeetStore();

    usePeerStats(client);

    const [copied, setCopied] = useState(false);
    const [canShare, setCanShare] = useState(false);
    const [canScreenShare, setCanScreenShare] = useState(false);
    const [showStats, setShowStats] = useState(false);
    const [pinnedId, setPinnedId] = useState<string | null>(null);
    const [isPicking, setIsPicking] = useState(false);
    const screenTrackRef = useRef<MediaStreamTrack | null>(null);
    const cameraWasOnBeforeShare = useRef(false);
    useEffect(() => {
        setCanShare('share' in navigator);
        setCanScreenShare(typeof navigator.mediaDevices?.getDisplayMedia === 'function');
    }, []);

    const remotePeers = useMemo(() => Array.from(peerConnections.values()), [peerConnections]);

    const { pipActive, pipWindow, pipMode, enterPip, exitPip } = usePip();

    // Clear pin when the pinned peer leaves.
    useEffect(() => {
        if (!pinnedId || pinnedId === LOCAL_TILE_ID) return;
        if (!peerConnections.has(pinnedId)) setPinnedId(null);
    }, [peerConnections, pinnedId]);

    // Re-broadcast our media state whenever the peer list changes so late-joining
    // peers immediately learn about active screen sharing (or mute state).
    const prevPeerCount = useRef(0);
    useEffect(() => {
        const count = peerConnections.size;
        if (count > prevPeerCount.current && client) {
            client.send('peer-state', { audio: !isMuted, video: !isVideoOff, screenSharing: isScreenSharing });
        }
        prevPeerCount.current = count;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [peerConnections]);

    // While screen sharing, show the screen track in the local tile.
    const localDisplayStream = useMemo(() => {
        if (!screenTrack) return localStream;
        const s = new MediaStream();
        s.addTrack(screenTrack);
        return s;
    }, [screenTrack, localStream]);

    const broadcastState = (audio: boolean, video: boolean, speaking?: boolean, screenSharing?: boolean) => {
        client?.send('peer-state', { audio, video, speaking, screenSharing: screenSharing ?? isScreenSharing });
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
        // While screen sharing, clicking camera stops the screen share and
        // switches back to the camera feed in one step. suppressCameraRestore=true
        // because we handle camera enable ourselves right after.
        if (isScreenSharing) {
            await doStopScreenShare(true);
            const track = await enableCamera();
            if (!track) { toast.error("Camera unavailable. Check browser permissions."); return; }
            if (useMeetStore.getState().isVideoOff) toggleVideo();
            broadcastState(!isMuted, true, undefined, false);
            return;
        }
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

    const doStopScreenShare = async (suppressCameraRestore = false) => {
        screenTrackRef.current?.stop();
        screenTrackRef.current = null;
        stopScreenShare();
        const shouldRestoreCamera = !suppressCameraRestore && cameraWasOnBeforeShare.current;
        cameraWasOnBeforeShare.current = false;
        // Read store state directly — this function is registered as a track
        // 'ended' listener and its closure captures isScreenSharing = false
        // (the value at the time handleScreenShare ran, before toggleScreenShare
        // was called). Reading from the store avoids the stale-closure bug.
        if (useMeetStore.getState().isScreenSharing) {
            toggleScreenShare();
            playScreenShareStop();
            const storedMuted = useMeetStore.getState().isMuted;
            if (shouldRestoreCamera) {
                const track = await enableCamera();
                if (track) {
                    toggleVideo();
                    broadcastState(!storedMuted, true, undefined, false);
                } else {
                    broadcastState(!storedMuted, false, undefined, false);
                }
            } else {
                broadcastState(!storedMuted, !useMeetStore.getState().isVideoOff, undefined, false);
            }
        }
    };

    const handleScreenShare = async () => {
        if (isScreenSharing) { doStopScreenShare(); return; }
        setIsPicking(true);
        const track = await startScreenShare();
        setIsPicking(false);
        if (!track) return;
        screenTrackRef.current = track;

        // Turn off the camera while screen sharing — only one video feed at a time.
        cameraWasOnBeforeShare.current = !isVideoOff;
        if (!isVideoOff) {
            disableCamera();
            toggleVideo();
        }

        toggleScreenShare();
        broadcastState(!isMuted, false, undefined, true);
        playScreenShareStart();
        track.addEventListener('ended', () => doStopScreenShare(), { once: true });
    };

    const handleEndCall = () => {
        screenTrackRef.current?.stop();
        screenTrackRef.current = null;
        playLeaveCall();
        clearMeet();
        clearJoinMeet();
    };

    const togglePin = (id: string) => setPinnedId(prev => prev === id ? null : id);

    const alone = remotePeers.length === 0;
    const participantCount = remotePeers.length + 1;
    const displayMeetCode = meetCode || routeMeetCode || '—';

    const statsRows = useMemo(
        () => remotePeers.map((c) => ({
            id: c.id,
            name: c.name || c.id.slice(0, 8),
            stats: peerStats.get(c.id) ?? {
                outboundBitrateKbps: 0, inboundBitrateKbps: 0,
                packetLossPercent: 0, roundTripTimeMs: -1,
                jitterMs: 0, candidateType: 'unknown' as const,
                quality: 'unknown' as const, encodingLevel: 2 as const, timestamp: 0,
            },
        })),
        [remotePeers, peerStats],
    );

    // ── Tile renderers ────────────────────────────────────────────────────────

    const renderLocalTile = (opts: { onPin?: () => void; isPinned?: boolean; compact?: boolean } = {}) => (
        <VideoTile
            key="local"
            isLocal
            userName={userName}
            isVideoOff={isScreenSharing ? false : isVideoOff}
            isMuted={isMuted}
            stream={localDisplayStream}
            onPin={opts.onPin}
            isPinned={opts.isPinned}
            compact={opts.compact}
        />
    );

    const renderRemoteTile = (c: typeof remotePeers[number], opts: { onPin?: () => void; isPinned?: boolean; compact?: boolean } = {}) => {
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
                isScreenSharing={c.screenSharing}
                onPin={opts.onPin}
                isPinned={opts.isPinned}
                compact={opts.compact}
            />
        );
    };

    // ── Spotlight ─────────────────────────────────────────────────────────────

    const pinnedPeer = pinnedId && pinnedId !== LOCAL_TILE_ID
        ? remotePeers.find(c => c.id === pinnedId) ?? null
        : null;
    const spotlightActive = pinnedId !== null && (pinnedId === LOCAL_TILE_ID || pinnedPeer !== null);

    const stripPeers = spotlightActive ? remotePeers.filter(c => c.id !== pinnedId) : [];
    const localInStrip = spotlightActive && pinnedId !== LOCAL_TILE_ID;
    const showStrip = spotlightActive && (localInStrip || stripPeers.length > 0);

    return (
        <div className="flex flex-col h-dvh w-full overflow-hidden text-[hsl(var(--foreground))]">

            {/* Brief blank overlay while the OS screen-picker is open. */}
            {isPicking && (
                <div className="fixed inset-0 z-[999] bg-[hsl(var(--background))]" aria-hidden="true" />
            )}

            <ConnectionBanner
                connState={connState}
                reconnectAttempt={reconnectAttempt}
                onLeave={handleEndCall}
            />

            {/* ── Top bar — outside the video layout ───────────────────── */}
            <header className="shrink-0 flex items-center justify-between gap-3 px-4 pt-4 pb-2 z-20">
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
                    {isScreenSharing && (
                        <div className="glass-pill gap-1.5 px-3 py-1.5 text-xs font-medium text-[hsl(var(--primary))]">
                            <Monitor className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                            Presenting
                        </div>
                    )}
                    <div className="glass-pill px-3 py-1.5 text-xs text-[hsl(var(--muted-foreground))]">
                        {participantCount} {participantCount === 1 ? 'participant' : 'participants'}
                    </div>
                </div>
            </header>

            {/* ── Video area ───────────────────────────────────────────── */}
            <main className="flex-1 min-h-0 flex flex-col px-3 gap-2">
                {spotlightActive ? (
                    <>
                        {/* Large pinned tile */}
                        <div className="flex-1 min-h-0">
                            {pinnedId === LOCAL_TILE_ID
                                ? renderLocalTile({ onPin: () => togglePin(LOCAL_TILE_ID), isPinned: true })
                                : pinnedPeer && renderRemoteTile(pinnedPeer, { onPin: () => togglePin(pinnedId!), isPinned: true })
                            }
                        </div>

                        {/* Thumbnail strip */}
                        {showStrip && (
                            <div className="shrink-0 flex gap-2 overflow-x-auto" style={{ height: '80px' }}>
                                {localInStrip && (
                                    <div className="shrink-0 rounded-xl overflow-hidden" style={{ width: '142px', height: '80px' }}>
                                        {renderLocalTile({ onPin: () => togglePin(LOCAL_TILE_ID), compact: true })}
                                    </div>
                                )}
                                {stripPeers.map(c => (
                                    <div key={c.id} className="shrink-0 rounded-xl overflow-hidden" style={{ width: '142px', height: '80px' }}>
                                        {renderRemoteTile(c, { onPin: () => togglePin(c.id), compact: true })}
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                ) : (
                    <VideoGrid gap={8} tileAspect={16 / 9}>
                        {renderLocalTile({ onPin: remotePeers.length > 0 ? () => togglePin(LOCAL_TILE_ID) : undefined })}
                        {remotePeers.map((c) => renderRemoteTile(c, { onPin: () => togglePin(c.id) }))}
                    </VideoGrid>
                )}
            </main>

            {/* "Invite someone" hint — shown only when alone */}
            {alone && (
                <div className="shrink-0 flex justify-center px-4 py-2">
                    <p className="glass-pill px-4 py-2 text-xs text-[hsl(var(--muted-foreground))]">
                        Share the code above to invite someone
                    </p>
                </div>
            )}

            {/* ── Control bar — outside the video layout ────────────────── */}
            <footer
                className="shrink-0 flex justify-center py-3"
                style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
            >
                <div className="glass-pill gap-2 px-2 py-2 shadow-xl shadow-[hsl(var(--shadow-color))]/25">
                    <MicButton onClickFn={handleMicToggle} action={isMuted ? "close" : "open"} />
                    <CameraButton onClickFn={handleCameraToggle} action={isVideoOff ? "close" : "open"} />
                    {hasMultipleCameras && !isVideoOff && !isScreenSharing && (
                        <FlipCameraButton onClickFn={handleFlipCamera} />
                    )}

                    {canScreenShare && (
                        <button
                            type="button"
                            onClick={handleScreenShare}
                            aria-label={isScreenSharing ? "Stop sharing screen" : "Share screen"}
                            className={`ctrl-btn h-9 w-9 sm:h-11 sm:w-11 ${isScreenSharing ? 'ctrl-btn-screen' : 'ctrl-btn-on'}`}
                        >
                            <Monitor className="w-4 h-4 sm:w-5 sm:h-5" />
                        </button>
                    )}

                    {pipMode !== 'none' && (
                        <div className="relative group/pip">
                            <button
                                type="button"
                                onClick={async () => {
                                    if (pipActive) {
                                        exitPip();
                                    } else {
                                        const opened = await enterPip();
                                        if (opened) toast.success("Call pinned — switch tabs or apps freely");
                                    }
                                }}
                                aria-label={pipActive ? "Close picture-in-picture" : "Picture-in-picture"}
                                className={`ctrl-btn h-9 w-9 sm:h-11 sm:w-11 ${pipActive ? 'ctrl-btn-screen' : 'ctrl-btn-on'}`}
                            >
                                <PictureInPicture2 className="w-4 h-4 sm:w-5 sm:h-5" />
                            </button>
                            {/* Tooltip — explains you need to click first before switching */}
                            {!pipActive && (
                                <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2
                                                opacity-0 group-hover/pip:opacity-100 transition-opacity
                                                whitespace-nowrap glass-pill px-2.5 py-1 text-[11px]
                                                text-[hsl(var(--muted-foreground))]">
                                    Click to keep call visible when you switch tabs
                                </div>
                            )}
                        </div>
                    )}

                    <div className="mx-1 h-5 w-px bg-[hsl(var(--border))]" />

                    <button
                        type="button"
                        onClick={() => setShowStats(v => !v)}
                        aria-label="Network stats"
                        className={`ctrl-btn h-9 w-9 sm:h-11 sm:w-11 ${showStats ? 'ctrl-btn-screen' : 'ctrl-btn-on'}`}
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
            </footer>

            {showStats && (
                <StatsPanel rows={statsRows} onClose={() => setShowStats(false)} />
            )}

            {/* Document PiP: render a compact video grid in the floating mini-window */}
            {pipActive && pipWindow && !pipWindow.closed && (
                <PipWindow pipWindow={pipWindow}>
                    <PipCallView
                        localStream={localDisplayStream}
                        isVideoOff={isScreenSharing ? false : isVideoOff}
                        isMuted={isMuted}
                        userName={userName}
                        remotePeers={remotePeers}
                    />
                </PipWindow>
            )}
        </div>
    );
}

// ── Compact call view rendered inside the Document PiP window ─────────────────

interface PipCallViewProps {
    localStream: MediaStream | null;
    isVideoOff: boolean;
    isMuted: boolean;
    userName: string;
    remotePeers: Array<{
        id: string;
        name?: string;
        audio?: boolean;
        video?: boolean;
        speaking?: boolean;
        stream?: MediaStream;
        screenSharing?: boolean;
    }>;
}

function PipCallView({ localStream, isVideoOff, isMuted, userName, remotePeers }: PipCallViewProps) {
    // Show up to 3 remote peers + local; remote peers are higher priority.
    const tiles: Array<{ id: string; isLocal: boolean; peer?: PipCallViewProps['remotePeers'][number] }> = [
        ...remotePeers.slice(0, 3).map(p => ({ id: p.id, isLocal: false, peer: p })),
        { id: 'local', isLocal: true },
    ];

    const count = tiles.length;
    const cols = count === 1 ? 1 : 2;
    const rows = count <= 2 ? 1 : 2;

    return (
        <div
            style={{
                width: '100vw',
                height: '100vh',
                display: 'grid',
                gridTemplateColumns: `repeat(${cols}, 1fr)`,
                gridTemplateRows: `repeat(${rows}, 1fr)`,
                gap: '2px',
                background: '#000',
            }}
        >
            {tiles.map(t => (
                t.isLocal ? (
                    <VideoTile
                        key="local"
                        isLocal
                        userName={userName}
                        isVideoOff={isVideoOff}
                        isMuted={isMuted}
                        stream={localStream}
                    />
                ) : (
                    <VideoTile
                        key={t.id}
                        participant={{
                            id: t.peer!.id,
                            name: t.peer!.name || t.peer!.id.slice(0, 6),
                            isMuted: !t.peer!.audio,
                            isVideoOff: !t.peer!.video,
                            speaking: t.peer!.speaking,
                        }}
                        stream={t.peer!.stream ?? null}
                        isScreenSharing={t.peer!.screenSharing}
                    />
                )
            ))}
        </div>
    );
}
