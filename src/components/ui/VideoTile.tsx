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
    speaking?: boolean;
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
    const label = isLocal ? `${name} (you)` : name;

    // Local: detect from own mic stream (reliable).
    // Remote: use the speaking flag broadcast by the remote peer — remote
    // WebRTC stream audio analysis is unreliable across browsers/pipelines.
    const localSpeaking = useAudioLevel(isLocal ? stream : null, isLocal && !muted);
    const speaking = isLocal ? localSpeaking : !!participant?.speaking;

    const color = avatarColor(name);
    const initials = initialsOf(name);

    return (
        <div className={`tile-in relative h-full w-full overflow-hidden rounded-2xl
                         border border-[hsl(var(--border))]/50
                         bg-[linear-gradient(160deg,hsl(var(--surface-2)),hsl(var(--surface-3)))]
                         ${speaking ? 'speaking-ring' : ''}`}>

            {/* Avatar (camera off or no stream yet) */}
            {(videoOff || !stream) && (
                <div className="absolute inset-0 flex items-center justify-center">
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
                </div>
            )}

            {/* Live video */}
            {!videoOff && stream && (
                <VideoStream stream={stream} isLocal={isLocal} />
            )}

            {/* Name pill */}
            <div className="glass-pill absolute bottom-2.5 left-2.5 gap-1 px-2 py-1 text-[12px]">
                {muted && <MicOff className="w-3 h-3 text-[hsl(var(--destructive))] shrink-0" />}
                <span className="truncate max-w-[140px]">{label}</span>
            </div>
        </div>
    );
};
