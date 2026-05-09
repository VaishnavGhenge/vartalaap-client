import { useEffect, useRef } from "react";
import type { RefObject } from "react";


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

        const tryPlay = (current: T) => {
            if (!current.srcObject || !current.paused) return;
            current.play().catch(() => {
                // Autoplay blocked (e.g. Document PiP window before first user
                // interaction). Register a one-shot pointer handler on the pip
                // document so the video resumes on the next tap/click.
                const doc = current.ownerDocument;
                const resume = () => { current.play().catch(() => {}); };
                doc.addEventListener('pointerdown', resume, { once: true });
            });
        };

        const sync = () => {
            const current = ref.current;
            if (!current) return;
            const tracks = kind === 'audio' ? (stream?.getAudioTracks() ?? []) : (stream?.getVideoTracks() ?? []);
            // Always use the global (main window) MediaStream constructor.
            // Remote WebRTC tracks are created in the main window's RTCPeerConnection
            // context; wrapping them with the Document PiP window's MediaStream
            // constructor silently produces an unplayable stream.
            const MediaStreamCtor = typeof MediaStream !== 'undefined' ? MediaStream : undefined;
            current.srcObject = tracks.length > 0
                ? (MediaStreamCtor ? new MediaStreamCtor(tracks) : stream)
                : null;
            if (current.srcObject) tryPlay(current);
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
    const ref = useRef<HTMLAudioElement>(null)

    useAttachTracks(ref, stream, 'audio')

    useEffect(() => {
        const el = ref.current
        if (!el) return
        const play = () => {
            if (!el.srcObject || !el.paused) return
            el.play().catch(() => {
                const doc = el.ownerDocument
                const resume = () => { el.play().catch(() => {}) }
                doc.addEventListener('pointerdown', resume, { once: true })
            })
        }
        play()
        stream?.addEventListener?.('addtrack', play)
        return () => stream?.removeEventListener?.('addtrack', play)
    }, [stream])

    return <audio ref={ref} autoPlay playsInline />
}
