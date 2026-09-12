"use client";
import { DeviceErrorNotice } from "@/src/components/ui/DeviceErrorNotice";

import {
    PhoneOff,
    Copy,
    Check,
    Share2,
    Monitor,
    UserCheck,
    Timer,
    ChevronDown,
    ChevronUp,
    Users,
    Settings,
} from "lucide-react";
import { SettingsPanel } from "@/src/components/ui/SettingsPanel";
import { toast } from "sonner";
import { cn } from "@/src/lib/utils";
import { resumeSharedAudioContext } from "@/src/lib/audio-context";
import { playKnockRequest, playLeaveCall, playScreenShareStart, playScreenShareStop } from "@/src/lib/sounds";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAudioLevel } from "@/src/hooks/use-audio-level";
import { MicButton } from "@/src/components/ui/MicButton";
import { CameraButton } from "@/src/components/ui/CameraButton";
import { FlipCameraButton } from "@/src/components/ui/FlipCameraButton";
import { useHasMultipleCameras } from "@/src/hooks/use-has-multiple-cameras";
import { VideoTile } from "@/src/components/ui/VideoTile";
import { VideoGrid } from "@/src/components/ui/VideoGrid";
import { ConnectionBanner } from "@/src/components/ui/ConnectionBanner";
import { useMeetStore } from "@/src/stores/meet";
import { usePeerStore } from "@/src/stores/peer";
import { useJoinMeetStore } from "@/src/stores/joinMeet";
import type { SignalingClient, ConnState } from "@/src/services/signaling/client";
import type { Envelope, KnockRequestData, PeerLeftData } from "@/src/services/signaling/protocol";
import { getAccessToken } from "@/src/services/api/token";
import { CALL_FEATURES } from "@/src/lib/feature-flags";
import { InlineNotice } from "@/src/components/ui/InlineNotice";
import { observeMediaTrackInterruption } from "@/src/services/webrtc/media-interruption";

const LOCAL_TILE_ID = "local";

interface MeetCallProps {
    client: SignalingClient | null;
    connState: ConnState;
    reconnectAttempt: number;
    routeMeetCode?: string;
    onLeave?: () => void;
}

export default function MeetCall({ client, connState, reconnectAttempt, routeMeetCode, onLeave }: MeetCallProps) {
    const localVideoQuality = usePeerStore((s) => s.localVideoQuality);
    const {
        isMuted,
        isVideoOff,
        isScreenSharing,
        roomClosesAt,
        toggleMute,
        toggleVideo,
        toggleScreenShare,
        clearMeet,
    } = useMeetStore();
    const {
        localStream,
        rawCameraTrack,
        rawMicTrack,
        screenTrack,
        enableMic,
        disableMic,
        enableCamera,
        disableCamera,
        switchCamera,
        startScreenShare,
        stopScreenShare,
        peerConnections,
        peerStats,
    } = usePeerStore();
    const hasMultipleCameras = useHasMultipleCameras();
    const { userName, meetCode, clearJoinMeet } = useJoinMeetStore();

    const [copied, setCopied] = useState(false);
    const [deviceError, setDeviceError] = useState<string | null>(null);
    const [showSettings, setShowSettings] = useState(false);
    const [canShare, setCanShare] = useState(false);
    const [canScreenShare, setCanScreenShare] = useState(false);
    const [pinnedId, setPinnedId] = useState<string | null>(null);
    const [isPicking, setIsPicking] = useState(false);
    const [knockRequests, setKnockRequests] = useState<Array<{ peerId: string; name: string }>>([]);
    const [knockExpanded, setKnockExpanded] = useState(false);

    // Session expiry — secsLeft is null when no closesAt (instant rooms).
    // Ticks every second when under 10 min so the in-call timer stays accurate.
    // At T−10min: timer appears in top bar (neutral).
    // At T−5min: timer turns amber + one-shot toast.
    // At T+0: auto-leave overlay with 10-second countdown.
    const [secsLeft, setSecsLeft] = useState<number | null>(null);
    const [autoLeaveCountdown, setAutoLeaveCountdown] = useState<number | null>(null);
    const tenMinToastFired = useRef(false);
    const fiveMinToastFired = useRef(false);

    useEffect(() => {
        if (!roomClosesAt) return;
        const closesMs = new Date(roomClosesAt).getTime();

        const tick = () => {
            const remaining = Math.max(0, closesMs - Date.now());
            const secs = Math.ceil(remaining / 1_000);
            setSecsLeft(secs);

            if (remaining <= 0) {
                setAutoLeaveCountdown((c) => c ?? 10);
            }
        };

        tick();
        const id = setInterval(tick, 1_000);
        return () => clearInterval(id);
    }, [roomClosesAt]);

    // One-shot toasts
    useEffect(() => {
        if (secsLeft === null) return;
        const mins = Math.ceil(secsLeft / 60);
        if (!tenMinToastFired.current && mins <= 10 && mins > 5) {
            tenMinToastFired.current = true;
            toast("10 minutes remaining in this session.");
        }
        if (!fiveMinToastFired.current && mins <= 5 && secsLeft > 0) {
            fiveMinToastFired.current = true;
            toast.warning("5 minutes remaining in this session.");
        }
    }, [secsLeft]);

    const screenTrackRef = useRef<MediaStreamTrack | null>(null);
    const cameraWasOnBeforeShare = useRef(false);

    const handleEndCall = () => {
        if (screenTrackRef.current) usePeerStore.getState().stopScreenShare();
        screenTrackRef.current = null;
        playLeaveCall();
        if (onLeave) {
            onLeave();
        } else {
            clearMeet();
            clearJoinMeet();
        }
    };

    // Auto-leave countdown
    useEffect(() => {
        if (autoLeaveCountdown === null) return;
        if (autoLeaveCountdown <= 0) {
            handleEndCall();
            return;
        }
        const id = setTimeout(() => setAutoLeaveCountdown((c) => (c ?? 1) - 1), 1_000);
        return () => clearTimeout(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoLeaveCountdown]);

    useEffect(() => {
        setCanShare("share" in navigator);
        setCanScreenShare(CALL_FEATURES.screenShare && typeof navigator.mediaDevices?.getDisplayMedia === "function");
    }, []);

    const reconcileInterruptedDevice = useCallback((kind: "camera" | "microphone", interruptedTrack: MediaStreamTrack) => {
            const peerState = usePeerStore.getState();
            const meetState = useMeetStore.getState();

            if (kind === "camera") {
                const current = peerState.rawCameraTrack ?? peerState.localStream?.getVideoTracks()[0] ?? null;
                if (current !== interruptedTrack || meetState.isVideoOff) return;
                peerState.disableCamera();
                meetState.toggleVideo();
                toast("Camera was interrupted. Click to re-enable.");
            } else {
                const current = peerState.rawMicTrack ?? peerState.localStream?.getAudioTracks()[0] ?? null;
                if (current !== interruptedTrack || meetState.isMuted) return;
                peerState.disableMic();
                useMeetStore.getState().toggleMute();
                toast("Microphone was interrupted. Click to re-enable.");
            }

            const fresh = useMeetStore.getState();
            client?.send("peer-state", {
                audio: !fresh.isMuted,
                video: !fresh.isVideoOff,
                screenSharing: fresh.isScreenSharing,
                videoHeld: usePeerStore.getState().localVideoQuality.videoHeld,
            });
    }, [client]);

    // Track events handle unplug/revocation while the page remains visible.
    // The visibility check remains as a wake-from-sleep fallback because some
    // browser/OS combinations update readyState without dispatching promptly.
    useEffect(() => {
        const cameraHwTrack = rawCameraTrack ?? localStream?.getVideoTracks()[0] ?? null;
        const micHwTrack = rawMicTrack ?? localStream?.getAudioTracks()[0] ?? null;
        const cleanups: Array<() => void> = [];
        if (cameraHwTrack) cleanups.push(observeMediaTrackInterruption(
            cameraHwTrack, () => reconcileInterruptedDevice("camera", cameraHwTrack),
        ));
        if (micHwTrack) cleanups.push(observeMediaTrackInterruption(
            micHwTrack, () => reconcileInterruptedDevice("microphone", micHwTrack), 3_000,
        ));

        const handleVisibilityChange = () => {
            if (document.visibilityState !== "visible") return;
            if (cameraHwTrack?.readyState === "ended") reconcileInterruptedDevice("camera", cameraHwTrack);
            if (micHwTrack && (micHwTrack.readyState === "ended" || micHwTrack.muted)) {
                reconcileInterruptedDevice("microphone", micHwTrack);
            }
        };

        document.addEventListener("visibilitychange", handleVisibilityChange);
        return () => {
            document.removeEventListener("visibilitychange", handleVisibilityChange);
            cleanups.forEach((cleanup) => cleanup());
        };
    }, [localStream, rawCameraTrack, rawMicTrack, reconcileInterruptedDevice]);

    // Host: listen for knock-request and queue incoming guests.
    // knock-request is broadcast to all room members, but only the authenticated
    // host should see the admit banner — admitted guests must not accidentally
    // admit newcomers because they also received the message.
    useEffect(() => {
        if (!client) return;
        const handleKnockRequest = (env: Envelope<KnockRequestData>) => {
            if (!env.data?.peerId) return;
            if (!getAccessToken()) return;
            setKnockRequests((prev) => {
                if (prev.some((r) => r.peerId === env.data!.peerId)) return prev;
                playKnockRequest();
                return [...prev, { peerId: env.data!.peerId, name: env.data!.name }];
            });
        };
        // Remove a knocking guest from the queue if they disconnect before being admitted.
        const handlePeerLeft = (env: Envelope<PeerLeftData>) => {
            if (!env.data?.peerId) return;
            setKnockRequests((prev) => prev.filter((r) => r.peerId !== env.data!.peerId));
        };
        client.on("knock-request", handleKnockRequest as (env: Envelope) => void);
        client.on("peer-left", handlePeerLeft as (env: Envelope) => void);
        return () => {
            client.off("knock-request", handleKnockRequest as (env: Envelope) => void);
            client.off("peer-left", handlePeerLeft as (env: Envelope) => void);
        };
    }, [client]);

    const remotePeers = useMemo(() => Array.from(peerConnections.values()), [peerConnections]);

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
            client.send("peer-state", {
                audio: !isMuted,
                video: !isVideoOff,
                screenSharing: isScreenSharing,
                videoHeld: usePeerStore.getState().localVideoQuality.videoHeld,
            });
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

    const isScreenSharingRef = useRef(isScreenSharing);
    useEffect(() => {
        isScreenSharingRef.current = isScreenSharing;
    }, [isScreenSharing]);

    const broadcastState = useCallback(
        (audio: boolean, video: boolean, speaking?: boolean, screenSharing?: boolean) => {
            client?.send("peer-state", {
                audio,
                video,
                speaking,
                screenSharing: screenSharing ?? isScreenSharingRef.current,
                videoHeld: usePeerStore.getState().localVideoQuality.videoHeld,
            });
        },
        [client],
    );

    const { speaking: localSpeaking } = useAudioLevel(localStream, !isMuted);
    const prevSpeakingRef = useRef(localSpeaking);
    useEffect(() => {
        if (prevSpeakingRef.current === localSpeaking) return;
        prevSpeakingRef.current = localSpeaking;
        broadcastState(!isMuted, !isVideoOff, localSpeaking);
    }, [localSpeaking, broadcastState, isMuted, isVideoOff]);

    const handleMicToggle = async () => {
        setDeviceError(null);
        const nextMuted = !isMuted;
        if (nextMuted) {
            disableMic();
        } else {
            resumeSharedAudioContext();
            const track = await enableMic();
            if (!track) {
                setDeviceError(
                    "Microphone unavailable. Allow access in your browser’s site settings, or choose another device in settings.",
                );
                return;
            }
        }
        toggleMute();
        broadcastState(!nextMuted, !isVideoOff, nextMuted ? false : undefined);
    };

    const handleCameraToggle = async () => {
        setDeviceError(null);
        // While screen sharing, clicking camera stops the screen share and
        // switches back to the camera feed in one step. suppressCameraRestore=true
        // because we handle camera enable ourselves right after.
        if (isScreenSharing) {
            await doStopScreenShare(true);
            const track = await enableCamera();
            if (!track) {
                setDeviceError(
                    "Camera unavailable. Allow access in your browser’s site settings, or choose another device in settings.",
                );
                return;
            }
            if (useMeetStore.getState().isVideoOff) toggleVideo();
            broadcastState(!isMuted, true, undefined, false);
            return;
        }
        const nextVideoOff = !isVideoOff;
        if (nextVideoOff) {
            disableCamera();
        } else {
            const track = await enableCamera();
            if (!track) {
                setDeviceError(
                    "Camera unavailable. Allow access in your browser’s site settings, or choose another device in settings.",
                );
                return;
            }
        }
        toggleVideo();
        broadcastState(!isMuted, !nextVideoOff);
    };

    const handleShare = async () => {
        try {
            if (canShare) {
                await navigator.share({ title: "Join my Sessionly call", url: window.location.href });
            } else {
                await navigator.clipboard.writeText(window.location.href);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
            }
        } catch (e) {
            if ((e as Error).name !== "AbortError") toast.error("Could not share");
        }
    };

    const handleFlipCamera = async () => {
        const ok = await switchCamera();
        if (!ok) toast.error("Could not switch camera.");
    };

    const doStopScreenShare = async (suppressCameraRestore = false) => {
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
                    setDeviceError(
                        "Camera unavailable. Allow access in your browser’s site settings, or choose another device in settings.",
                    );
                    broadcastState(!storedMuted, false, undefined, false);
                }
            } else {
                broadcastState(!storedMuted, !useMeetStore.getState().isVideoOff, undefined, false);
            }
        }
    };

    const handleScreenShare = async () => {
        if (isScreenSharing) {
            doStopScreenShare();
            return;
        }

        // Disable camera BEFORE calling startScreenShare so the black placeholder
        // is not the last track written to the video sender. startScreenShare()
        // will overwrite the placeholder with the real screen track. If we did
        // this after, the placeholder would race-overwrite the screen track and
        // remote peers would see black.
        cameraWasOnBeforeShare.current = !isVideoOff;
        if (!isVideoOff) {
            disableCamera();
            toggleVideo();
        }

        setIsPicking(true);
        const track = await startScreenShare();
        setIsPicking(false);

        if (!track) {
            // User cancelled the picker — restore the camera if it was on.
            if (cameraWasOnBeforeShare.current) {
                cameraWasOnBeforeShare.current = false;
                const cameraTrack = await enableCamera();
                if (cameraTrack) {
                    toggleVideo();
                } else {
                    setDeviceError(
                        "Camera unavailable. Allow access in your browser’s site settings, or choose another device in settings.",
                    );
                }
            }
            return;
        }

        screenTrackRef.current = track;
        toggleScreenShare();
        broadcastState(!isMuted, false, undefined, true);
        playScreenShareStart();
        track.addEventListener("ended", () => doStopScreenShare(), { once: true });
    };

    const handleAdmit = (peerId: string) => {
        client?.send("knock-admit", { peerId });
        setKnockRequests((prev) => prev.filter((r) => r.peerId !== peerId));
    };

    const handleAdmitAll = () => {
        knockRequests.forEach((r) => client?.send("knock-admit", { peerId: r.peerId }));
        setKnockRequests([]);
        setKnockExpanded(false);
    };

    const handleDeny = (peerId: string) => {
        setKnockRequests((prev) => prev.filter((r) => r.peerId !== peerId));
    };

    const togglePin = (id: string) => setPinnedId((prev) => (prev === id ? null : id));

    const alone = remotePeers.length === 0;
    const participantCount = remotePeers.length + 1;
    const displayMeetCode = meetCode || routeMeetCode || "—";

    // ── Tile renderers ────────────────────────────────────────────────────────

    const renderLocalTile = (opts: { onPin?: () => void; isPinned?: boolean; compact?: boolean } = {}) => (
        <VideoTile
            key="local"
            isLocal
            userName={userName}
            isVideoOff={isScreenSharing ? false : isVideoOff}
            isMuted={isMuted}
            stream={localDisplayStream}
            speaking={isMuted ? false : localSpeaking}
            onPin={opts.onPin}
            isPinned={opts.isPinned}
            compact={opts.compact}
        />
    );

    const renderRemoteTile = (
        c: (typeof remotePeers)[number],
        opts: { onPin?: () => void; isPinned?: boolean; compact?: boolean } = {},
    ) => {
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
                isScreenSharing={c.screenSharing}
                connectionState={c.connectionState}
                videoHeld={c.videoHeld}
                onPin={opts.onPin}
                isPinned={opts.isPinned}
                compact={opts.compact}
            />
        );
    };

    return (
        <div className="call-stage flex flex-col h-dvh w-full overflow-hidden text-[hsl(var(--foreground))]">
            {/* Brief blank overlay while the OS screen-picker is open. */}
            {isPicking && <div className="fixed inset-0 z-[999] bg-[hsl(var(--background))]" aria-hidden="true" />}

            {deviceError && (
                <DeviceErrorNotice
                    message={deviceError}
                    onSettings={() => setShowSettings(true)}
                    onDismiss={() => setDeviceError(null)}
                />
            )}
            <ConnectionBanner connState={connState} reconnectAttempt={reconnectAttempt} onLeave={handleEndCall} />
            {!isVideoOff && localVideoQuality.encodingLevel < 2 && (
                <div role="status" className="shrink-0 px-4 pt-3">
                    <InlineNotice
                        title={
                            localVideoQuality.videoHeld
                                ? "Video paused to protect your audio"
                                : "Video quality reduced for your connection"
                        }
                    >
                        Your camera stays selected. Video quality will recover automatically when your connection
                        improves.
                    </InlineNotice>
                </div>
            )}

            {/* Session expired overlay — auto-leave countdown */}
            {autoLeaveCountdown !== null && (
                <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-[hsl(var(--background))]/90 backdrop-blur-sm">
                    <div className="glass-pill flex flex-col items-center gap-3 px-8 py-6 text-center">
                        <Timer className="w-8 h-8 text-[hsl(var(--destructive))]" />
                        <p className="text-sm font-semibold text-[hsl(var(--foreground))]">Session time is up</p>
                        <p className="text-xs text-[hsl(var(--muted-foreground))]">
                            Leaving automatically in {autoLeaveCountdown}s
                        </p>
                        <button
                            type="button"
                            onClick={handleEndCall}
                            className="cursor-pointer rounded-full bg-[hsl(var(--destructive))] px-4 py-1.5 text-xs font-semibold text-[hsl(var(--destructive-foreground))] hover:opacity-90 transition-opacity"
                        >
                            Leave now
                        </button>
                    </div>
                </div>
            )}

            {/* Persistent session timer — shown from T−10min */}
            {autoLeaveCountdown === null && secsLeft !== null && secsLeft > 0 && secsLeft <= 10 * 60 && (
                <div className="shrink-0 flex justify-center py-1 pointer-events-none">
                    <div
                        className={cn(
                            "glass-pill flex items-center gap-2 px-4 py-2 text-xs font-semibold tabular-nums shadow-lg",
                            secsLeft <= 5 * 60
                                ? "border border-amber-500/40 text-amber-500"
                                : "text-[hsl(var(--muted-foreground))]",
                        )}
                    >
                        <Timer className="size-3.5 shrink-0" />
                        {formatSecsLeft(secsLeft)}
                    </div>
                </div>
            )}

            {/* Host: knock-request banner — top-center, merged when multiple */}
            {knockRequests.length > 0 && (
                <div className="call-stage shrink-0 mx-auto w-full max-w-sm px-3 py-2">
                    <div
                        className="pointer-events-auto rounded-2xl border border-[hsl(var(--border)/0.55)] bg-[hsl(var(--surface)/0.90)] shadow-lg overflow-hidden"
                        style={{ backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)" }}
                    >
                        {/* Header row — always visible */}
                        <div className="flex items-center gap-3 px-4 py-3">
                            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--primary))]/15">
                                {knockRequests.length === 1 ? (
                                    <UserCheck className="w-4 h-4 text-[hsl(var(--primary))]" />
                                ) : (
                                    <Users className="w-4 h-4 text-[hsl(var(--primary))]" />
                                )}
                            </div>

                            <div className="flex-1 min-w-0">
                                {knockRequests.length === 1 ? (
                                    <p className="text-sm font-semibold text-[hsl(var(--foreground))] truncate">
                                        <span className="max-w-[140px] inline-block truncate align-bottom">
                                            {knockRequests[0].name || "Someone"}
                                        </span>{" "}
                                        wants to join
                                    </p>
                                ) : (
                                    <p className="text-sm font-semibold text-[hsl(var(--foreground))]">
                                        {knockRequests.length} people want to join
                                    </p>
                                )}
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                                {knockRequests.length === 1 ? (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => handleDeny(knockRequests[0].peerId)}
                                            aria-label={`Deny ${knockRequests[0].name || "guest"}`}
                                            className="press rounded-lg border border-[hsl(var(--border))] px-3 py-1.5 text-xs font-medium
                                                       text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))] transition-colors"
                                        >
                                            Deny
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleAdmit(knockRequests[0].peerId)}
                                            aria-label={`Admit ${knockRequests[0].name || "guest"}`}
                                            className="press rounded-lg bg-[hsl(var(--primary))] px-3 py-1.5 text-xs font-semibold
                                                       text-[hsl(var(--primary-foreground))] hover:brightness-110 transition-[filter]"
                                        >
                                            Admit
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button
                                            type="button"
                                            onClick={handleAdmitAll}
                                            className="press rounded-lg bg-[hsl(var(--primary))] px-3 py-1.5 text-xs font-semibold
                                                       text-[hsl(var(--primary-foreground))] hover:brightness-110 transition-[filter]"
                                        >
                                            Admit all
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setKnockExpanded((p) => !p)}
                                            aria-label={knockExpanded ? "Collapse requests" : "Expand requests"}
                                            className="press flex size-7 items-center justify-center rounded-lg border border-[hsl(var(--border))]
                                                       text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))] transition-colors"
                                        >
                                            {knockExpanded ? (
                                                <ChevronUp className="w-3.5 h-3.5" />
                                            ) : (
                                                <ChevronDown className="w-3.5 h-3.5" />
                                            )}
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Expanded list — shown for multiple requests only */}
                        {knockRequests.length > 1 && knockExpanded && (
                            <div className="border-t border-[hsl(var(--border))]">
                                {knockRequests.map(({ peerId, name }) => (
                                    <div
                                        key={peerId}
                                        className="flex items-center gap-3 px-4 py-2.5 border-b border-[hsl(var(--border))] last:border-b-0"
                                    >
                                        <span className="flex-1 min-w-0 text-sm text-[hsl(var(--foreground))] truncate">
                                            {name || "Someone"}
                                        </span>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => handleDeny(peerId)}
                                                aria-label={`Deny ${name || "guest"}`}
                                                className="press rounded-lg border border-[hsl(var(--border))] px-2.5 py-1 text-xs font-medium
                                                           text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))] transition-colors"
                                            >
                                                Deny
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleAdmit(peerId)}
                                                aria-label={`Admit ${name || "guest"}`}
                                                className="press rounded-lg bg-[hsl(var(--primary))] px-2.5 py-1 text-xs font-semibold
                                                           text-[hsl(var(--primary-foreground))] hover:brightness-110 transition-[filter]"
                                            >
                                                Admit
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── Top bar — outside the video layout ───────────────────── */}
            <header className="shrink-0 flex items-center justify-between gap-3 px-4 pt-4 pb-2 z-20">
                <button
                    type="button"
                    onClick={handleShare}
                    aria-label={canShare ? "Share meeting" : "Copy meeting link"}
                    className="press glass-pill gap-2 px-3 py-1.5 text-sm
                               hover:bg-[hsl(var(--surface-2))] transition-colors"
                >
                    <span className="meet-code">{displayMeetCode}</span>
                    {copied ? (
                        <Check className="w-3.5 h-3.5 text-[hsl(var(--primary))]" />
                    ) : canShare ? (
                        <Share2 className="w-3.5 h-3.5 text-[hsl(var(--muted-foreground))]" />
                    ) : (
                        <Copy className="w-3.5 h-3.5 text-[hsl(var(--muted-foreground))]" />
                    )}
                </button>

                <div className="flex items-center gap-2">
                    {isScreenSharing && (
                        <div className="glass-pill gap-1.5 px-3 py-1.5 text-xs font-medium text-[hsl(var(--primary))]">
                            <Monitor className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                            Presenting
                        </div>
                    )}
                    <div className="glass-pill px-3 py-1.5 text-xs text-[hsl(var(--muted-foreground))]">
                        {participantCount} {participantCount === 1 ? "participant" : "participants"}
                    </div>
                </div>
            </header>

            {/* ── Video area ───────────────────────────────────────────── */}
            <main className="flex-1 min-h-0 flex flex-col px-3 gap-2">
                <VideoGrid gap={8} tileAspect={16 / 9} focusKey={pinnedId} conversation>
                    {renderLocalTile({
                        onPin: remotePeers.length ? () => togglePin(LOCAL_TILE_ID) : undefined,
                        isPinned: pinnedId === LOCAL_TILE_ID,
                    })}
                    {remotePeers.map((c) =>
                        renderRemoteTile(c, { onPin: () => togglePin(c.id), isPinned: pinnedId === c.id }),
                    )}
                </VideoGrid>
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
                style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
            >
                <div className="glass-pill gap-2 px-2 py-2 shadow-xl shadow-[hsl(var(--shadow-color))]/25">
                    <MicButton onClickFn={handleMicToggle} action={isMuted ? "close" : "open"} />
                    <CameraButton onClickFn={handleCameraToggle} action={isVideoOff ? "close" : "open"} />
                    <button
                        type="button"
                        onClick={() => setShowSettings(open => !open)}
                        aria-expanded={showSettings}
                        aria-controls="call-settings-panel"
                        aria-label="Audio and video settings"
                        title="Audio and video settings"
                        className="ctrl-btn ctrl-btn-on size-11"
                    >
                        <Settings className="size-5" />
                    </button>
                    {CALL_FEATURES.cameraFlip && hasMultipleCameras && !isVideoOff && !isScreenSharing && (
                        <FlipCameraButton onClickFn={handleFlipCamera} />
                    )}

                    {CALL_FEATURES.screenShare && canScreenShare && (
                        <button
                            type="button"
                            onClick={handleScreenShare}
                            aria-label={isScreenSharing ? "Stop sharing screen" : "Share screen"}
                            className={`ctrl-btn h-9 w-9 sm:h-11 sm:w-11 ${isScreenSharing ? "ctrl-btn-screen" : "ctrl-btn-on"}`}
                        >
                            <Monitor className="w-4 h-4 sm:w-5 sm:h-5" />
                        </button>
                    )}

                    <div className="mx-1 h-5 w-px bg-[hsl(var(--border))]" />

                    <button
                        type="button"
                        onClick={handleEndCall}
                        aria-label="Leave call"
                        className="ctrl-btn ctrl-btn-off h-9 sm:h-11 px-4 sm:px-5 gap-1.5 rounded-full font-semibold text-sm"
                    >
                        <PhoneOff className="w-4 h-4 shrink-0" />
                        <span className="hidden sm:inline">Leave</span>
                    </button>
                </div>
            </footer>
            {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} isVideoOff={isVideoOff} />}
        </div>
    );
}

function formatSecsLeft(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, "0")} left`;
}
