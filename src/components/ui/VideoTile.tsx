"use client";

import { Mic, MicOff, Pin, PinOff, WifiOff, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AudioStream, VideoStream } from "@/src/components/ui/Video";
import { useAudioLevel } from "@/src/hooks/use-audio-level";
import { avatarColor, initialsOf } from "@/src/lib/avatar";
import type { PeerStats } from "@/src/stores/peer";

const REMOTE_HOLD_MS = 280

const QUALITY_DOT_COLOR: Record<PeerStats['quality'], string> = {
    good: 'bg-emerald-400',
    medium: 'bg-amber-400',
    poor: 'bg-red-500',
    unknown: 'bg-zinc-400',
}

const QUALITY_LABEL: Record<PeerStats['quality'], string> = {
    good: 'Good',
    medium: 'Fair',
    poor: 'Poor',
    unknown: 'Measuring',
}

interface Participant {
    id: string;
    name: string;
    isMuted?: boolean;
    isVideoOff?: boolean;
    speaking?: boolean;
}

interface VideoTileProps {
    participant?: Participant;
    isLocal?: boolean;
    userName?: string;
    isVideoOff?: boolean;
    isMuted?: boolean;
    stream: MediaStream | null;
    quality?: PeerStats['quality'];
    isScreenSharing?: boolean;
    onPin?: () => void;
    isPinned?: boolean;
    /** Compact mode for small thumbnail tiles — abbreviates the name pill. */
    compact?: boolean;
    connectionState?: RTCPeerConnectionState;
    videoHeld?: boolean;
    /** Pass the already-computed speaking state to skip internal audio analysis. */
    speaking?: boolean;
}

export const VideoTile = ({
    participant,
    isLocal = false,
    userName,
    isVideoOff,
    isMuted,
    stream,
    quality,
    isScreenSharing = false,
    onPin,
    isPinned = false,
    compact = false,
    connectionState,
    videoHeld = false,
    speaking: speakingProp,
}: VideoTileProps) => {
    const name = isLocal ? (userName || 'You') : (participant?.name || 'Participant');
    // When a remote peer is screen sharing their video track IS the screen —
    // never hide it based on camera state.
    const videoOff = isLocal
        ? !!isVideoOff
        : (isScreenSharing ? false : !!participant?.isVideoOff);
    const muted = isLocal ? !!isMuted : !!participant?.isMuted;
    const label = isLocal ? `${name} (you)` : name;

    // Skip internal audio analysis when the caller provides speaking state directly
    // (e.g. local tile in MeetCall, where audio is already analysed for broadcasting).
    const { speaking: localSpeaking } = useAudioLevel(
        isLocal && speakingProp === undefined ? stream : null,
        isLocal && speakingProp === undefined && !muted,
    );
    const [remoteSpeaking, setRemoteSpeaking] = useState(false);
    const holdTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
    useEffect(() => {
        if (isLocal) return;
        if (participant?.speaking) {
            clearTimeout(holdTimer.current);
            setRemoteSpeaking(true);
        } else {
            holdTimer.current = setTimeout(() => setRemoteSpeaking(false), REMOTE_HOLD_MS);
        }
        return () => clearTimeout(holdTimer.current);
    }, [isLocal, participant?.speaking]);
    const speaking = speakingProp !== undefined ? speakingProp : (isLocal ? localSpeaking : remoteSpeaking);

    const color = avatarColor(name);
    const initials = initialsOf(name);

    return (
        <div
            aria-label={speaking ? `${label}, speaking` : label}
            className={`group tile-in relative h-full w-full overflow-hidden rounded-2xl
                         bg-[linear-gradient(160deg,hsl(var(--surface-2)),hsl(var(--surface-3)))]
                         transition-[border-color,box-shadow] duration-150
                         ${speaking
                             ? 'border-2 border-white/70 shadow-[0_0_0_2px_hsl(var(--primary)/0.5)]'
                             : 'border border-[hsl(var(--border))]/50'
                         }
                         ${isPinned && !speaking ? 'ring-2 ring-[hsl(var(--primary))]/60' : ''}`}
        >

            {/* Avatar (camera off or no stream yet) */}
            {(videoOff || !stream) && (
                <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
                    {compact ? (
                        // Fixed 32 px circle for thumbnail strip tiles
                        <div className={`flex items-center justify-center rounded-full ${color} text-white font-semibold text-xs`}
                             style={{ width: 32, height: 32 }}>
                            {initials}
                        </div>
                    ) : (
                        <div className={`flex items-center justify-center rounded-full ${color} text-white font-semibold`}
                             style={{
                                 width: '22%',
                                 aspectRatio: '1/1',
                                 minWidth: 44, minHeight: 44,
                                 maxWidth: 108, maxHeight: 108,
                                 fontSize: 'clamp(16px, 3.8vw, 38px)',
                             }}>
                            {initials}
                        </div>
                    )}
                </div>
            )}

            {!isLocal && stream && <AudioStream stream={stream} />}
            {!videoOff && stream && (
                <VideoStream
                    stream={stream}
                    isLocal={isLocal}
                    objectFit={isScreenSharing ? 'contain' : 'cover'}
                />
            )}

            {/* Media status — high-contrast badges that stay readable over bright video. */}
            {!compact && (
                <div className="absolute top-2.5 right-2.5 z-10 flex items-center gap-1.5">
                    {/* Quality dot */}
                    {!isLocal && quality && quality !== 'unknown' && (
                        <button
                            type="button"
                            aria-label={`Connection quality: ${QUALITY_LABEL[quality]}`}
                            className="group/quality relative flex size-7 cursor-pointer items-center justify-center rounded-full
                                       border border-white/25 bg-zinc-950/75 text-white shadow-lg shadow-black/25 backdrop-blur-md
                                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                        >
                            <span className={`block size-2 rounded-full ${QUALITY_DOT_COLOR[quality]}`} />
                            <span
                                role="tooltip"
                                className="pointer-events-none absolute right-0 top-full mt-1 whitespace-nowrap rounded-md
                                           bg-[hsl(var(--surface-3))] px-2 py-1 text-[10px] font-medium
                                           text-[hsl(var(--foreground))] opacity-0 shadow-lg
                                           transition-opacity group-hover/quality:opacity-100 group-focus-visible/quality:opacity-100"
                            >
                                {QUALITY_LABEL[quality]}
                            </span>
                        </button>
                    )}
                    {/* Mic badge */}
                    <div
                        role="img"
                        aria-label={muted ? 'Microphone muted' : 'Microphone on'}
                        className={`flex size-7 items-center justify-center rounded-full border shadow-lg shadow-black/25 backdrop-blur-md
                                    ${muted
                                        ? 'border-red-300/35 bg-red-600/85 text-white'
                                        : 'border-white/25 bg-zinc-950/75 text-white'
                                    }`}
                    >
                        {muted
                            ? <MicOff className="size-3.5" strokeWidth={2.4} />
                            : <Mic className="size-3.5" strokeWidth={2.4} />
                        }
                    </div>
                </div>
            )}

            {/* Pin / unpin button — bottom-right, visible on hover or always when pinned.
                Kept away from the top bar (top-left) so it is always reachable. */}
            {onPin && (
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onPin(); }}
                    aria-label={isPinned ? 'Unpin' : 'Pin'}
                    className={`absolute bottom-2.5 right-2.5 z-10 flex items-center justify-center
                                w-7 h-7 rounded-full glass-pill transition-opacity cursor-pointer
                                ${isPinned
                                    ? 'opacity-100 text-[hsl(var(--primary))]'
                                    : 'opacity-0 group-hover:opacity-100 text-[hsl(var(--foreground))]'
                                }`}
                >
                    {isPinned
                        ? <PinOff className="w-3.5 h-3.5" />
                        : <Pin className="w-3.5 h-3.5" />
                    }
                </button>
            )}

            {/* Connection state overlays — remote tiles only */}
            {!isLocal && connectionState === 'disconnected' && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2
                                bg-[hsl(var(--background))]/60 backdrop-blur-sm">
                    <Loader2 className="w-5 h-5 text-[hsl(var(--muted-foreground))] animate-spin" />
                    {!compact && (
                        <span className="text-[11px] font-medium text-[hsl(var(--muted-foreground))]">
                            Reconnecting…
                        </span>
                    )}
                </div>
            )}
            {!isLocal && connectionState === 'failed' && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2
                                bg-[hsl(var(--background))]/60 backdrop-blur-sm">
                    <WifiOff className="w-5 h-5 text-[hsl(var(--destructive))]" />
                    {!compact && (
                        <span className="text-[11px] font-medium text-[hsl(var(--destructive))]">
                            Connection lost
                        </span>
                    )}
                </div>
            )}

            {/* Video held badge — shown when outbound video is paused for bandwidth */}
            {!isLocal && videoHeld && !compact && connectionState !== 'failed' && (
                <div className="absolute top-2.5 left-2.5 z-10">
                    <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full leading-none
                                     bg-[hsl(var(--destructive))]/15 text-[hsl(var(--destructive))]">
                        Audio only
                    </span>
                </div>
            )}

            {/* Name pill — compact tiles show initials so the pill never overflows. */}
            <div aria-hidden="true"
                 className={`glass-pill absolute bottom-2 left-2 gap-1 px-2 py-0.5 ${compact ? 'text-[10px]' : 'text-[12px] overflow-hidden max-w-[calc(100%-1rem)]'}`}>
                {speaking && !muted && !compact && (
                    <span className="flex items-end gap-[2px] h-3 shrink-0" style={{ height: 12 }}>
                        <span className="audio-bar" style={{ height: 8 }} />
                        <span className="audio-bar" style={{ height: 10 }} />
                        <span className="audio-bar" style={{ height: 7 }} />
                    </span>
                )}
                {compact
                    ? <span>{initials}</span>
                    : <span className="truncate min-w-0">{isScreenSharing ? `${label} • Screen` : label}</span>
                }
            </div>
        </div>
    );
};
