"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Copy, Check, Share2, Settings } from "lucide-react";
import { SettingsPanel } from "@/src/components/ui/SettingsPanel";
import { resumeSharedAudioContext } from "@/src/lib/audio-context";
import { playJoinCall } from "@/src/lib/sounds";
import { MicButton } from "@/src/components/ui/MicButton";
import { CameraButton } from "@/src/components/ui/CameraButton";
import { FlipCameraButton } from "@/src/components/ui/FlipCameraButton";
import { Input } from "@/src/components/ui/input";
import { useParams } from "next/navigation";
import { Button } from "@/src/components/ui/button";
import { usePeerStore } from "@/src/stores/peer";
import { useHasMultipleCameras } from "@/src/hooks/use-has-multiple-cameras";
import { useMeetStore } from "@/src/stores/meet";
import { useJoinMeetStore } from "@/src/stores/joinMeet";
import { avatarColor, initialsOf } from "@/src/lib/avatar";
import { fetchIceServers } from "@/src/services/api/ice";
import { useAudioLevel } from "@/src/hooks/use-audio-level";
import { useMediaDevices } from "@/src/hooks/use-media-devices";
import { supportsAudioOutputSelection } from "@/src/lib/audio-context";
import { MicLevelMeter } from "@/src/components/ui/MicLevelMeter";
import { DeviceSelect } from "@/src/components/ui/DeviceSelect";
import { Collapsible } from "@/src/components/ui/Collapsible";

export default function JoinMeet() {
    const params = useParams<{ meetCode: string }>();
    const videoRef = useRef<HTMLVideoElement>(null);

    const [meetCode, setMeetCode] = useState("");
    const [copied, setCopied] = useState(false);
    const [canShare, setCanShare] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    useEffect(() => { setCanShare('share' in navigator); }, []);

    const { localStream, enableMic, disableMic, enableCamera, disableCamera, switchCamera, setIceServers,
            setAudioInput, setVideoInput, setAudioOutput,
            preferredAudioInputId, preferredVideoInputId, preferredAudioOutputId } = usePeerStore();
    const hasMultipleCameras = useHasMultipleCameras();
    const { isMuted, isVideoOff, toggleMute, toggleVideo } = useMeetStore();
    const { audioInputs, videoInputs, audioOutputs } = useMediaDevices();
    const showSpeaker = supportsAudioOutputSelection() && audioOutputs.length > 0;
    const { speaking, level } = useAudioLevel(localStream, !isMuted);
    const { userName, setUserName, setMeetCode: setStoredMeetCode, setHasJoinedMeet } = useJoinMeetStore();

    useEffect(() => { setMeetCode(params.meetCode); }, [params]);

    useEffect(() => {
        fetchIceServers()
            .then(setIceServers)
            .catch(() => { /* will retry inside use-call on join */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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

    const handleJoin = () => {
        if (!userName.trim()) return;
        setStoredMeetCode(params.meetCode);
        resumeSharedAudioContext();
        playJoinCall();
        setHasJoinedMeet(true);
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

    const previewName = userName || 'You';
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

                            {/* Mic level meter + confirmation — shown when mic is on */}
                            {!isMuted && (
                                <div className="absolute bottom-14 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1">
                                    <MicLevelMeter level={level} active={speaking} className="w-32 h-5" />
                                    <span className={`text-[10px] font-medium transition-opacity duration-200
                                                      text-[hsl(var(--brand-glow))]
                                                      ${speaking ? 'opacity-100' : 'opacity-0'}`}>
                                        We can hear you
                                    </span>
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

                            {/* Meeting code row */}
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

                            <div className="mt-4 flex flex-col gap-3">
                                <label htmlFor="join-name" className="sr-only">Your name</label>
                                <Input
                                    id="join-name"
                                    placeholder="Your name"
                                    value={userName}
                                    onChange={(e) => setUserName(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                                    autoComplete="name"
                                    maxLength={40}
                                />
                                <Button
                                    onClick={handleJoin}
                                    disabled={!userName.trim()}
                                    size="lg"
                                    className="w-full"
                                >
                                    Join now
                                </Button>
                            </div>
                        </div>
                    </div>

                </div>
            </div>

        {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} isVideoOff={isVideoOff} />}
        </main>
    );
}
