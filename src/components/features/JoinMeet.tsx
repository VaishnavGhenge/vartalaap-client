"use client";

import { useEffect, useState, useRef } from "react";
import { toast } from "sonner";
import { Copy, Check } from "lucide-react";
import { MicButton } from "@/src/components/ui/MicButton";
import { CameraButton } from "@/src/components/ui/CameraButton";
import { Input } from "@/src/components/ui/input";
import { useParams } from "next/navigation";
import { Button } from "@/src/components/ui/button";
import { usePeerStore } from "@/src/stores/peer";
import { useMeetStore } from "@/src/stores/meet";
import { useJoinMeetStore } from "@/src/stores/joinMeet";
import { avatarColor, initialsOf } from "@/src/lib/avatar";

export default function JoinMeet() {
    const params = useParams<{ meetCode: string }>();
    const videoRef = useRef<HTMLVideoElement>(null);

    const [meetCode, setMeetCode] = useState("");
    const [copied, setCopied] = useState(false);

    const { localStream, enableMic, disableMic, enableCamera, disableCamera } = usePeerStore();
    const { isMuted, isVideoOff, toggleMute, toggleVideo } = useMeetStore();
    const { userName, setUserName, setHasJoinedMeet } = useJoinMeetStore();

    useEffect(() => {
        setMeetCode(params.meetCode);
    }, [params]);

    useEffect(() => {
        if (videoRef.current) videoRef.current.srcObject = localStream;
    }, [localStream]);

    const handleCameraToggle = async () => {
        if (isVideoOff) {
            const track = await enableCamera();
            if (!track) {
                toast.error("Camera unavailable. Check browser permissions and try again.");
                return;
            }
        } else {
            disableCamera();
        }
        toggleVideo();
    };

    const handleMicToggle = async () => {
        if (isMuted) {
            const track = await enableMic();
            if (!track) {
                toast.error("Microphone unavailable. Check browser permissions and try again.");
                return;
            }
        } else {
            disableMic();
        }
        toggleMute();
    };

    const handleJoinMeet = () => {
        if (!userName.trim()) return;
        setHasJoinedMeet(true);
    };

    const handleCopyCode = async () => {
        try {
            await navigator.clipboard.writeText(meetCode);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            toast.error("Could not copy");
        }
    };

    const previewName = userName || 'You';
    const avatarBg = avatarColor(previewName);
    const initials = initialsOf(previewName);

    return (
        <main className='relative flex flex-1 overflow-hidden text-[hsl(var(--foreground))]'>
            <div className='pointer-events-none absolute inset-0 opacity-[0.08]'
                 style={{ background: 'radial-gradient(50% 40% at 50% 0%, hsl(var(--brand-glow) / 0.42) 0%, transparent 70%)' }} />

            <div className='relative w-full max-w-6xl mx-auto px-4 py-8 lg:py-14 flex items-center'>
                <div className='grid grid-cols-1 lg:grid-cols-5 gap-8 w-full'>
                    {/* Preview tile */}
                    <div className='lg:col-span-3 flex flex-col items-center justify-center'>
                        <div className='app-panel relative w-full overflow-hidden rounded-[2rem]'
                             style={{ aspectRatio: '16/9' }}>
                            {isVideoOff ? (
                                <div className='absolute inset-0 flex items-center justify-center bg-[linear-gradient(160deg,hsl(var(--surface-2)),hsl(var(--surface-3)))]'>
                                    <div className={`flex items-center justify-center rounded-full ${avatarBg} text-white font-semibold shadow-lg`}
                                         style={{ width: '24%', aspectRatio: '1 / 1', minWidth: 72, minHeight: 72, maxWidth: 140, maxHeight: 140, fontSize: 'clamp(24px, 5vw, 48px)' }}>
                                        {initials}
                                    </div>
                                </div>
                            ) : null}

                            <video
                                ref={videoRef}
                                className='absolute inset-0 w-full h-full object-cover'
                                autoPlay
                                muted
                                playsInline
                            />

                            <div className='absolute left-4 bottom-4 rounded-full border border-[hsl(var(--border))]/70 bg-[hsl(var(--surface))]/82 px-3 py-1 text-sm backdrop-blur-sm'>
                                {previewName}
                            </div>

                            <div className='absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-[hsl(var(--border))]/70 bg-[hsl(var(--surface))]/82 px-2 py-2 backdrop-blur-md'>
                                <MicButton onClickFn={handleMicToggle} action={isMuted ? "close" : "open"} />
                                <CameraButton onClickFn={handleCameraToggle} action={isVideoOff ? "close" : "open"} />
                            </div>
                        </div>
                    </div>

                    {/* Join form */}
                    <div className='lg:col-span-2 flex flex-col justify-center'>
                        <div className='app-panel rounded-[2rem] p-6 sm:p-8'>
                            <div className='inline-flex rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-[hsl(var(--muted-foreground))]'>
                                Pre-join
                            </div>
                            <h2 className='mt-4 text-3xl font-semibold tracking-tight'>Ready to join?</h2>
                            <p className='mt-2 text-sm text-[hsl(var(--muted-foreground))]'>Check your camera and mic, confirm your name, then jump in.</p>

                            <div className='mt-8 flex items-center justify-between gap-3 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))]/85 px-4 py-3'>
                                <div className='flex flex-col'>
                                    <span className='text-[11px] uppercase tracking-wider text-[hsl(var(--muted-foreground))]'>Meeting code</span>
                                    <span className='font-mono tracking-wide text-[hsl(var(--foreground))]'>{meetCode || '—'}</span>
                                </div>
                                <button
                                    type='button'
                                    onClick={handleCopyCode}
                                    className='press inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 py-1.5 text-xs text-[hsl(var(--foreground))]'
                                >
                                    {copied ? <Check className='w-4 h-4 text-[hsl(var(--brand-glow))]' /> : <Copy className='w-4 h-4' />}
                                    {copied ? 'Copied' : 'Copy'}
                                </button>
                            </div>

                            <Input
                                placeholder='Enter your name'
                                value={userName}
                                onChange={(e) => setUserName(e.target.value)}
                                className='mt-4'
                            />

                            <Button
                                onClick={handleJoinMeet}
                                disabled={!userName.trim()}
                                className='mt-4 h-11 font-medium'
                            >
                                Join now
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}
