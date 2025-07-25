"use client";

import {User, MicOff} from "lucide-react";
import {VideoStream} from "@/src/components/ui/Video";

interface VideoTileProps {
    participant?: any;
    isLocal?: boolean;
    userName?: string;
    isVideoOff?: boolean;
    isMuted?: boolean;
    stream: MediaStream | null;
}

export const VideoTile = ({participant, isLocal = false, userName, isVideoOff, isMuted, stream}: VideoTileProps) => {
    const displayName = isLocal ? (userName || 'You') : (participant?.name || 'Participant');
    const videoOff = isLocal ? isVideoOff : participant?.isVideoOff;
    const muted = isLocal ? isMuted : participant?.isMuted;

    return (
        <div className='relative bg-gray-900 rounded-xl overflow-hidden w-full' style={{aspectRatio: '16/9'}}>
                <span
                    className='absolute top-3 left-3 z-10 bg-black bg-opacity-60 px-2 py-1 rounded text-sm text-white font-medium'>
                    {displayName}
                </span>

            {videoOff ? (
                <div className='absolute inset-0 flex items-center justify-center bg-gray-800'>
                    <div className='text-center'>
                        <div
                            className='w-12 h-12 bg-gray-600 rounded-full flex items-center justify-center mx-auto mb-2'>
                            <User className='w-6 h-6 text-gray-400'/>
                        </div>
                        <span className='text-sm text-gray-300'>Camera off</span>
                    </div>
                </div>
            ) : (
                <VideoStream stream={stream} isLocal={isLocal}/>
            )}

            {/* Muted indicator */}
            {muted && (
                <div className='absolute bottom-3 right-3 bg-red-600 rounded-full p-1'>
                    <MicOff className='w-4 h-4 text-white'/>
                </div>
            )}
        </div>
    );
}
