"use client";
import { useCallback, useEffect, useRef, useState } from 'react';

declare global {
    interface Window {
        documentPictureInPicture?: {
            requestWindow(opts?: {
                width?: number;
                height?: number;
                preferInitialWindowPlacement?: boolean;
            }): Promise<Window>;
            window: Window | null;
        };
    }
}

export type PipMode = 'document' | 'element' | 'none';

function detectPipMode(): PipMode {
    if (typeof window === 'undefined') return 'none';
    if ('documentPictureInPicture' in window) return 'document';
    // iOS Safari reports pictureInPictureEnabled=true but requestPictureInPicture()
    // does not work for MediaStream (srcObject) sources — exclude it entirely.
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window);
    if (!isIOS && 'pictureInPictureEnabled' in document && document.pictureInPictureEnabled) return 'element';
    return 'none';
}

// Find the best candidate video for element PiP.
// Prefer a remote (unmuted) video that is already playing with actual frames.
function findBestVideo(): HTMLVideoElement | null {
    const all = Array.from(document.querySelectorAll<HTMLVideoElement>('video'));
    const playing = all.filter(v => v.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && v.videoWidth > 0);
    return (
        playing.find(v => !v.muted) ??  // remote video with frames
        playing[0] ??                   // any video with frames
        all.find(v => !v.muted) ??      // remote video not yet playing
        all[0] ?? null
    );
}

export function usePip() {
    const [pipMode] = useState<PipMode>(detectPipMode);
    const [pipActive, setPipActive] = useState(false);
    const [pipWindow, setPipWindow] = useState<Window | null>(null);
    const pipWindowRef = useRef<Window | null>(null);

    const closePip = useCallback(() => {
        setPipActive(false);
        setPipWindow(null);
        pipWindowRef.current = null;
    }, []);

    useEffect(() => {
        if (pipMode !== 'document') return;

        // Arc (and some other browsers) fire 'pagehide' on the Document PiP window
        // when the user switches tabs, silently killing it. Detect this on both
        // focus return and visibilitychange so state resets and the button is usable again.
        const checkAlive = () => {
            if (!pipWindowRef.current) return;
            if (pipWindowRef.current.closed || window.documentPictureInPicture?.window == null) {
                closePip();
            }
        };

        window.addEventListener('focus', checkAlive);
        document.addEventListener('visibilitychange', checkAlive);
        return () => {
            window.removeEventListener('focus', checkAlive);
            document.removeEventListener('visibilitychange', checkAlive);
        };
    }, [pipMode, closePip]);

    const enterPip = useCallback(async (): Promise<boolean> => {
        if (pipActive) return false;

        if (pipMode === 'document') {
            try {
                const win = await window.documentPictureInPicture!.requestWindow({
                    width: 480,
                    height: 270,
                    preferInitialWindowPlacement: true,
                });
                pipWindowRef.current = win;
                setPipWindow(win);
                setPipActive(true);
                win.addEventListener('pagehide', closePip, { once: true });
                return true;
            } catch {
                return false;
            }
        } else if (pipMode === 'element') {
            const video = findBestVideo();
            if (!video) return false;
            try {
                // Ensure the video is playing before requesting PiP — browsers
                // reject the call if the video is paused or not yet decoded.
                if (video.paused) await video.play().catch(() => {});
                await video.requestPictureInPicture();
                setPipActive(true);
                video.addEventListener('leavepictureinpicture', () => setPipActive(false), { once: true });
                return true;
            } catch {
                return false;
            }
        }
        return false;
    }, [pipActive, pipMode, closePip]);

    const exitPip = useCallback(async () => {
        if (!pipActive) return;
        if (pipMode === 'document') {
            window.documentPictureInPicture?.window?.close();
        } else if (pipMode === 'element' && document.pictureInPictureElement) {
            try { await document.exitPictureInPicture(); } catch {}
            setPipActive(false);
        }
    }, [pipActive, pipMode]);

    return { pipActive, pipWindow, pipMode, enterPip, exitPip };
}
