"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Copy, Check, Share2, Settings, Loader2, Clock, CalendarOff, LogIn } from "lucide-react";
import { fetchRoomStatus, type RoomStatusResult } from "@/src/services/api/room";
import { getMe } from "@/src/services/api/auth";
import { getAccessToken } from "@/src/services/api/token";
import { useAuthStore } from "@/src/stores/auth";
import { SettingsPanel } from "@/src/components/ui/SettingsPanel";
import { resumeSharedAudioContext } from "@/src/lib/audio-context";
import { playJoinCall } from "@/src/lib/sounds";
import { MicButton } from "@/src/components/ui/MicButton";
import { CameraButton } from "@/src/components/ui/CameraButton";
import { FlipCameraButton } from "@/src/components/ui/FlipCameraButton";
import { Input } from "@/src/components/ui/input";
import { useParams } from "next/navigation";
import { Button } from "@/src/components/ui/button";
import { useAuth } from "@/src/hooks/use-auth";
import { usePeerStore } from "@/src/stores/peer";
import { useHasMultipleCameras } from "@/src/hooks/use-has-multiple-cameras";
import { useMeetStore } from "@/src/stores/meet";
import { useJoinMeetStore } from "@/src/stores/joinMeet";
import { avatarColor, initialsOf } from "@/src/lib/avatar";
import { useAudioLevel } from "@/src/hooks/use-audio-level";
import { useMediaDevices } from "@/src/hooks/use-media-devices";
import { supportsAudioOutputSelection } from "@/src/lib/audio-context";
import { MicLevelMeter } from "@/src/components/ui/MicLevelMeter";
import { DeviceSelect } from "@/src/components/ui/DeviceSelect";
import { Collapsible } from "@/src/components/ui/Collapsible";
import { callDefaults } from "@/src/lib/call-defaults";

const meetCodePattern = /^[a-z2-9]{3}-[a-z2-9]{4}-[a-z2-9]{3}$/;

export default function JoinMeet() {
    const params = useParams<{ meetCode: string }>();
    const videoRef = useRef<HTMLVideoElement>(null);

    const [meetCode, setMeetCode] = useState("");
    const [copied, setCopied] = useState(false);
    const [canShare, setCanShare] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [isJoining, setIsJoining] = useState(false);
    const [sessionExpired, setSessionExpired] = useState(false);
    const [roomStatus, setRoomStatus] = useState<RoomStatusResult | null>(null);
    const [statusChecked, setStatusChecked] = useState(false);
    const canJoinMeet = meetCodePattern.test(params.meetCode);
    useEffect(() => { setCanShare('share' in navigator); }, []);

    const { localStream, enableMic, disableMic, enableCamera, disableCamera, switchCamera,
            setAudioInput, setVideoInput, setAudioOutput,
            preferredAudioInputId, preferredVideoInputId, preferredAudioOutputId } = usePeerStore();
    const hasMultipleCameras = useHasMultipleCameras();
    const { isMuted, isVideoOff, toggleMute, toggleVideo, setRoomClosesAt } = useMeetStore();
    const { audioInputs, videoInputs, audioOutputs } = useMediaDevices();
    const showSpeaker = supportsAudioOutputSelection() && audioOutputs.length > 0;
    const { speaking, level } = useAudioLevel(localStream, !isMuted);
    const { userName, setUserName, setMeetCode: setStoredMeetCode, setHasJoinedMeet } = useJoinMeetStore();
    const { user, isAuthenticated, isLoading: authLoading } = useAuth();
    const joinName = isAuthenticated && user ? (user.name || user.email) : userName;

    useEffect(() => {
        setRoomStatus(null);
        setStatusChecked(false);
        if (!canJoinMeet) { setStatusChecked(true); return; }
        let cancelled = false;
        fetchRoomStatus(params.meetCode)
            .then((status) => {
                if (!cancelled) {
                    setRoomStatus(status);
                    setRoomClosesAt(status.closesAt ?? null);
                }
            })
            .finally(() => { if (!cancelled) setStatusChecked(true); });
        return () => { cancelled = true; };
    }, [canJoinMeet, params.meetCode, setRoomClosesAt, setRoomStatus, setStatusChecked]);

    useEffect(() => { setMeetCode(params.meetCode); }, [params]);

    // Apply the user's saved call defaults once on mount. The store resets to
    // isMuted=true / isVideoOff=true on every load; we correct to their saved
    // preference here before they interact with the toggles.
    useEffect(() => {
        const { isMuted, isVideoOff, toggleMute, toggleVideo } = useMeetStore.getState();
        if (callDefaults.getMicOn() && isMuted) toggleMute();
        if (callDefaults.getCameraOn() && isVideoOff) toggleVideo();
    }, []);

    useEffect(() => {
        if (isAuthenticated && user) {
            setUserName(user.name || user.email);
        }
    }, [isAuthenticated, user, setUserName]);

    useEffect(() => {
        if (videoRef.current) videoRef.current.srcObject = localStream;
    }, [localStream]);

    const handleCameraToggle = async () => {
        if (isVideoOff) {
            const track = await enableCamera();
            if (!track) { toast.error("Camera unavailable. Check browser permissions."); return; }
        } else {
            disableCamera();
        }
        toggleVideo();
    };

    const handleMicToggle = async () => {
        if (isMuted) {
            const track = await enableMic();
            if (!track) { toast.error("Microphone unavailable. Check browser permissions."); return; }
        } else {
            disableMic();
        }
        toggleMute();
    };

    const proceedJoin = (name: string) => {
        setUserName(name);
        setStoredMeetCode(params.meetCode);
        resumeSharedAudioContext();
        playJoinCall();
        setHasJoinedMeet(true);
    };

    const handleJoin = async () => {
        const name = joinName.trim();
        if (!name || !canJoinMeet || isJoining) return;
        setIsJoining(true);

        // Preflight: if this user looks logged in, make sure the session is
        // actually alive BEFORE entering the call. getMe() transparently
        // refreshes an expired access token; it only fails when the refresh
        // cookie itself is dead. Catching that here means the user chooses
        // (sign in / join as guest) in the lobby instead of sitting in a call
        // where the SFU silently rejects every request. A transient server
        // error must not block joining — only a confirmed-dead session does
        // (the failed refresh clears the stored token).
        if (getAccessToken()) {
            try {
                await getMe();
            } catch {
                if (!getAccessToken()) {
                    setIsJoining(false);
                    setSessionExpired(true);
                    return;
                }
            }
        }

        proceedJoin(name);
    };

    const handleContinueAsGuest = () => {
        // The dead token is already cleared; reset the auth UI state so the
        // join flow treats us as a guest (name input + knock/admit path).
        const name = joinName.trim();
        useAuthStore.getState().logout();
        setSessionExpired(false);
        setIsJoining(true);
        proceedJoin(name);
    };

    const handleShare = async () => {
        try {
            if (canShare) {
                await navigator.share({ title: 'Join my Sessionly call', url: window.location.href });
            } else {
                await navigator.clipboard.writeText(window.location.href);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
            }
        } catch (e) {
            if ((e as Error).name !== 'AbortError') toast.error("Could not share");
        }
    };

    const previewName = joinName || 'You';
    const avatarBg = avatarColor(previewName);
    const initials = initialsOf(previewName);

    return (
        <main className="relative flex flex-1 overflow-y-auto">
            <div className="w-full max-w-5xl mx-auto px-4 py-6 sm:py-10 lg:py-16
                            flex items-start sm:items-center">
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-6 w-full">

                    {/* ── Camera preview ────────────────────────────────── */}
                    <div className="lg:col-span-3">
                        <div className={`tile-in app-panel relative w-full overflow-hidden rounded-2xl${speaking ? ' speaking-ring' : ''}`}
                             style={{ aspectRatio: '16/9' }}>

                            {/* Settings — top-right of the preview */}
                            <button
                                type="button"
                                onClick={() => setShowSettings(true)}
                                aria-label="Open settings"
                                className="absolute top-2.5 right-2.5 z-10 ctrl-btn ctrl-btn-on w-8 h-8"
                            >
                                <Settings className="w-4 h-4" />
                            </button>

                            {/* Avatar placeholder when camera is off */}
                            {isVideoOff && (
                                <div className="absolute inset-0 flex items-center justify-center
                                                bg-[linear-gradient(160deg,hsl(var(--surface-2)),hsl(var(--surface-3)))]">
                                    <div className={`flex items-center justify-center rounded-full
                                                     ${avatarBg} text-white font-semibold`}
                                         style={{
                                             width: '22%',
                                             aspectRatio: '1/1',
                                             minWidth: 64, minHeight: 64,
                                             maxWidth: 120, maxHeight: 120,
                                             fontSize: 'clamp(20px, 4.5vw, 44px)',
                                         }}>
                                        {initials}
                                    </div>
                                </div>
                            )}

                            <video
                                ref={videoRef}
                                className="absolute inset-0 w-full h-full object-cover"
                                autoPlay muted playsInline
                            />

                            {/* Name label */}
                            <div className="glass-pill absolute left-3 bottom-3 px-2.5 py-1 text-[13px]">
                                {previewName}
                            </div>

                            {/* Mic level meter — shown when mic is on */}
                            {!isMuted && (
                                <div className="absolute bottom-14 left-1/2 -translate-x-1/2 w-32 h-5">
                                    <MicLevelMeter level={level} active={speaking} />
                                </div>
                            )}

                            {/* Mic + camera toggles */}
                            <div className="glass-pill absolute bottom-3 left-1/2 -translate-x-1/2 gap-1.5 px-1.5 py-1.5">
                                <MicButton onClickFn={handleMicToggle} action={isMuted ? "close" : "open"} size="sm" />
                                <CameraButton onClickFn={handleCameraToggle} action={isVideoOff ? "close" : "open"} size="sm" />
                                {hasMultipleCameras && !isVideoOff && (
                                    <FlipCameraButton
                                        onClickFn={async () => {
                                            const ok = await switchCamera();
                                            if (!ok) toast.error("Could not switch camera.");
                                        }}
                                        size="sm"
                                    />
                                )}
                            </div>
                        </div>

                        {/* Device selectors — collapsed by default, persisted for power users */}
                        {(audioInputs.length > 0 || videoInputs.length > 0 || showSpeaker) && (
                            <Collapsible
                                label="Audio & video settings"
                                storageKey="join-devices-open"
                                className="mt-3"
                            >
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    <DeviceSelect
                                        id="join-mic"
                                        label="Microphone"
                                        devices={audioInputs}
                                        value={preferredAudioInputId}
                                        onChange={(id) => { void setAudioInput(id) }}
                                    />
                                    <DeviceSelect
                                        id="join-camera"
                                        label="Camera"
                                        devices={videoInputs}
                                        value={preferredVideoInputId}
                                        onChange={(id) => { void setVideoInput(id) }}
                                    />
                                    {showSpeaker && (
                                        <DeviceSelect
                                            id="join-speaker"
                                            label="Speaker"
                                            devices={audioOutputs}
                                            value={preferredAudioOutputId}
                                            onChange={(id) => { void setAudioOutput(id) }}
                                            className="sm:col-span-2"
                                        />
                                    )}
                                </div>
                            </Collapsible>
                        )}
                    </div>

                    {/* ── Join panel ────────────────────────────────────── */}
                    <div className="lg:col-span-2 flex flex-col justify-center">
                        <div className="app-panel rounded-2xl p-5 sm:p-6">

                            {/* Meeting code row — always visible */}
                            <div className="flex items-center justify-between gap-3
                                            rounded-xl border border-[hsl(var(--border))]
                                            bg-[hsl(var(--surface-2))]/80 px-4 py-3">
                                <div className="flex flex-col gap-0.5 min-w-0">
                                    <span className="label-caps">Meeting code</span>
                                    <span className="meet-code text-sm text-[hsl(var(--foreground))] truncate">
                                        {meetCode || '—'}
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleShare}
                                    aria-label={copied ? 'Link copied' : canShare ? 'Share meeting link' : 'Copy meeting link'}
                                    className="press glass-pill shrink-0 gap-1.5 px-3 py-1.5 text-xs
                                               text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]
                                               focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]/50"
                                >
                                    {copied
                                        ? <Check className="w-3.5 h-3.5 text-[hsl(var(--primary))]" aria-hidden="true" />
                                        : canShare
                                            ? <Share2 className="w-3.5 h-3.5" aria-hidden="true" />
                                            : <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                                    }
                                    {copied ? 'Copied' : canShare ? 'Share' : 'Copy'}
                                </button>
                            </div>

                            {!statusChecked ? (
                                /* Status check in flight */
                                <div className="mt-6 flex items-center justify-center py-6">
                                    <Loader2 className="size-5 animate-spin text-[hsl(var(--muted-foreground))]" aria-label="Checking room status" />
                                </div>
                            ) : roomStatus && roomStatus.status !== 'open' && roomStatus.status !== 'unavailable' ? (
                                /* Room is not accessible — show a clear reason */
                                <RoomStatusCard status={roomStatus} />
                            ) : sessionExpired ? (
                                /* Signed-in session can no longer be renewed — let the
                                   user pick a path instead of failing inside the call. */
                                <SessionExpiredCard
                                    meetCode={params.meetCode}
                                    onContinueAsGuest={handleContinueAsGuest}
                                />
                            ) : (
                                <div className="mt-4 flex flex-col gap-3">
                                    {authLoading ? (
                                        <p className="rounded-xl border border-[hsl(var(--border))]/70 bg-[hsl(var(--surface-2))] px-3 py-2.5 text-sm text-[hsl(var(--muted-foreground))]">
                                            Preparing your session…
                                        </p>
                                    ) : isAuthenticated && user ? (
                                        <div className="flex items-center gap-3 rounded-xl border border-[hsl(var(--border))]/70 bg-[hsl(var(--surface-2))] px-3 py-2.5">
                                            {user.avatarUrl ? (
                                                <img src={user.avatarUrl} alt={joinName} className="size-8 rounded-full object-cover" />
                                            ) : (
                                                <span className={`flex size-8 items-center justify-center rounded-full ${avatarColor(joinName)} text-xs font-semibold text-white`}>
                                                    {initialsOf(joinName)}
                                                </span>
                                            )}
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-medium text-[hsl(var(--foreground))]">{joinName}</p>
                                                <p className="text-xs text-[hsl(var(--muted-foreground))]">Joining with your Sessionly profile</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <label htmlFor="join-name" className="sr-only">Your name</label>
                                            <Input
                                                id="join-name"
                                                placeholder="Your name"
                                                value={userName}
                                                onChange={(e) => setUserName(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                                                autoComplete="name"
                                                maxLength={40}
                                                disabled={isJoining}
                                            />
                                        </>
                                    )}
                                    <Button
                                        onClick={handleJoin}
                                        disabled={authLoading || !joinName.trim() || !canJoinMeet || isJoining}
                                        aria-busy={isJoining}
                                        size="lg"
                                        className="w-full"
                                    >
                                        {isJoining && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                                        {isJoining ? "Joining..." : "Join now"}
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>

                </div>
            </div>

        {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} isVideoOff={isVideoOff} />}
        </main>
    );
}

function SessionExpiredCard({ meetCode, onContinueAsGuest }: {
    meetCode: string;
    onContinueAsGuest: () => void;
}) {
    return (
        <div className="mt-4 flex flex-col gap-3">
            <div className="rounded-xl border border-[hsl(var(--border))]/70 bg-[hsl(var(--surface-2))] p-4">
                <div className="flex items-start gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--surface-3))] text-[hsl(var(--muted-foreground))]">
                        <LogIn className="size-4" />
                    </span>
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-[hsl(var(--foreground))]">Your session has expired</p>
                        <p className="mt-1 text-sm leading-5 text-[hsl(var(--muted-foreground))]">
                            Sign in again to join with your profile, or continue as a guest —
                            the host will be asked to let you in.
                        </p>
                    </div>
                </div>
            </div>
            <Button asChild size="lg" className="w-full">
                <a href={`/login?next=${encodeURIComponent(`/room/${meetCode}`)}`}>Sign in again</a>
            </Button>
            <Button onClick={onContinueAsGuest} variant="secondary" size="lg" className="w-full">
                Continue as a guest
            </Button>
        </div>
    );
}

function RoomStatusCard({ status }: { status: RoomStatusResult }) {
    const tooEarly = status.status === "too_early";
    const Icon = tooEarly ? Clock : CalendarOff;
    const opensAt = status.opensAt
        ? new Intl.DateTimeFormat(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
        }).format(new Date(status.opensAt))
        : null;
    const title = tooEarly ? "This room is not open yet" : "This room is not available";
    const body = status.message || (tooEarly && opensAt
        ? `You can join from ${opensAt}.`
        : "Check the meeting link or ask the host for a new one.");

    return (
        <div className="mt-4 rounded-xl border border-[hsl(var(--border))]/70 bg-[hsl(var(--surface-2))] p-4">
            <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--surface-3))] text-[hsl(var(--muted-foreground))]">
                    <Icon className="size-4" />
                </span>
                <div className="min-w-0">
                    <p className="text-sm font-semibold text-[hsl(var(--foreground))]">{title}</p>
                    <p className="mt-1 text-sm leading-5 text-[hsl(var(--muted-foreground))]">{body}</p>
                </div>
            </div>
        </div>
    );
}
