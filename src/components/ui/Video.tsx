import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { getSharedAudioContext } from "@/src/lib/audio-context";


interface VideoProps {
    stream: MediaStream | null;
    isLocal: boolean;
    objectFit?: 'cover' | 'contain';
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


export const VideoStream = ({stream, isLocal, objectFit = 'cover'}: VideoProps) => {
    const ref = useRef<HTMLVideoElement>(null);

    useAttachTracks(ref, stream, 'video');

    return <video
        ref={ref}
        className={`absolute inset-0 w-full h-full pointer-events-none ${objectFit === 'contain' ? 'object-contain' : 'object-cover'}`}
        autoPlay
        muted={isLocal}
        playsInline
    />
}


export const AudioStream = ({ stream }: { stream: MediaStream | null }) => {
    useEffect(() => {
        if (!stream) return
        const ctx = getSharedAudioContext()
        if (!ctx) return
        // Resume if user interaction hasn't unlocked the context yet.
        if (ctx.state === 'suspended') ctx.resume().catch(() => {})
        // Route remote audio through the interactive-latency AudioContext so
        // playout delay is minimised — shorter delay helps the remote peer's
        // AEC3 correlate their speaker output with their mic and converge faster,
        // which is the primary cause of the brief echo at the start of calls.
        const source = ctx.createMediaStreamSource(stream)
        source.connect(ctx.destination)
        return () => { try { source.disconnect() } catch { /* noop */ } }
    }, [stream])

    return null
}
