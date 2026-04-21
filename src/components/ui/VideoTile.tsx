"use client";

import { MicOff } from "lucide-react";
import { VideoStream } from "@/src/components/ui/Video";
import { useAudioLevel } from "@/src/hooks/use-audio-level";
import { avatarColor, initialsOf } from "@/src/lib/avatar";

interface Participant {
    id: string;
    name: string;
    isMuted?: boolean;
    isVideoOff?: boolean;
}

interface VideoTileProps {
    participant?: Participant;
    isLocal?: boolean;
    userName?: string;
    isVideoOff?: boolean;
    isMuted?: boolean;
    stream: MediaStream | null;
}

export const VideoTile = ({
    participant,
    isLocal = false,
    userName,
    isVideoOff,
    isMuted,
    stream,
}: VideoTileProps) => {
    const name = isLocal ? (userName || 'You') : (participant?.name || 'Participant');
    const videoOff = isLocal ? !!isVideoOff : !!participant?.isVideoOff;
    const muted = isLocal ? !!isMuted : !!participant?.isMuted;

    // Speaking detection: ignore our own audio (it's not broadcast to ourselves anyway
    // because <video muted={isLocal}/>, but MediaStream still carries the track).
    const speaking = useAudioLevel(stream, !muted);

    const color = avatarColor(name);
    const initials = initialsOf(name);
    const label = isLocal ? `${name} (you)` : name;

    return (
        <div
            className={`tile-in relative h-full w-full overflow-hidden rounded-[1.5rem] border border-[hsl(var(--border))]/60 bg-[linear-gradient(160deg,hsl(var(--surface-2)),hsl(var(--surface-3)))] ${speaking ? 'speaking-ring' : ''}`}
        >
            {videoOff || !stream ? (
                <div className='absolute inset-0 flex items-center justify-center bg-[linear-gradient(160deg,hsl(var(--surface-2)),hsl(var(--surface-3)))]'>
                    <div className={`flex items-center justify-center rounded-full ${color} text-white font-semibold shadow-lg`}
                         style={{ width: '22%', aspectRatio: '1 / 1', minWidth: 48, minHeight: 48, maxWidth: 112, maxHeight: 112, fontSize: 'clamp(18px, 4vw, 40px)' }}>
                        {initials}
                    </div>
                </div>
            ) : (
                <VideoStream stream={stream} isLocal={isLocal} />
            )}

            <div className='absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full border border-[hsl(var(--border))]/70 bg-[hsl(var(--surface))]/82 px-2.5 py-1 text-[13px] text-[hsl(var(--foreground))] backdrop-blur-sm'>
                {muted && <MicOff className='w-3.5 h-3.5 text-[hsl(var(--destructive))]' />}
                <span className='truncate max-w-[160px]'>{label}</span>
            </div>
        </div>
    );
}
