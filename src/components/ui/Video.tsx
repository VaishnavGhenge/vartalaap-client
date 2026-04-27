import {useEffect, useRef} from "react";
import type { RefObject } from "react";


interface VideoProps {
    stream : MediaStream | null;
    isLocal : boolean;
}


function useAttachTracks<T extends HTMLMediaElement>(
    ref: RefObject<T | null>,
    stream: MediaStream | null,
    kind: 'audio' | 'video',
) {
    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        const sync = () => {
            if (!ref.current) return;
            const tracks = kind === 'audio' ? (stream?.getAudioTracks() ?? []) : (stream?.getVideoTracks() ?? []);
            ref.current.srcObject = tracks.length > 0
                ? (typeof MediaStream === 'undefined' ? stream : new MediaStream(tracks))
                : null;
        };

        sync();

        const eventTarget = stream as (EventTarget & MediaStream) | null;
        eventTarget?.addEventListener?.('addtrack', sync);
        eventTarget?.addEventListener?.('removetrack', sync);

        return () => {
            eventTarget?.removeEventListener?.('addtrack', sync);
            eventTarget?.removeEventListener?.('removetrack', sync);
        };
    }, [kind, ref, stream]);
}


export const VideoStream = ({stream, isLocal}: VideoProps) => {
    const ref = useRef<HTMLVideoElement>(null);

    useAttachTracks(ref, stream, 'video');

    return <video
        ref={ref}
        className='absolute inset-0 w-full h-full object-cover'
        autoPlay
        muted={isLocal}
        playsInline
    />
}


export const AudioStream = ({stream}: { stream: MediaStream | null }) => {
    const ref = useRef<HTMLAudioElement>(null);

    useAttachTracks(ref, stream, 'audio');

    return <audio
        ref={ref}
        autoPlay
        hidden
        playsInline
    />
}
