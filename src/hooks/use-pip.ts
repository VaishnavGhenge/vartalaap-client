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
    if (typeof window.documentPictureInPicture?.requestWindow === 'function') return 'document';
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

    const closeIfDocumentPipGone = useCallback(() => {
        if (pipMode !== 'document') return;
        const win = pipWindowRef.current;
        if (!win) return;
        const currentPipWindow = window.documentPictureInPicture?.window ?? null;
        if (
            win.closed ||
            currentPipWindow == null ||
            currentPipWindow !== win ||
            win.document?.visibilityState === 'hidden'
        ) {
            closePip();
        }
    }, [closePip, pipMode]);

    const closeIfElementPipGone = useCallback(() => {
        if (pipMode !== 'element') return;
        if (document.pictureInPictureElement == null) {
            closePip();
        }
    }, [closePip, pipMode]);

    useEffect(() => {
        if (pipMode !== 'document' || !pipActive) return;

        window.addEventListener('focus', closeIfDocumentPipGone);
        window.addEventListener('pageshow', closeIfDocumentPipGone);
        document.addEventListener('visibilitychange', closeIfDocumentPipGone);
        const interval = window.setInterval(closeIfDocumentPipGone, 1000);

        return () => {
            window.removeEventListener('focus', closeIfDocumentPipGone);
            window.removeEventListener('pageshow', closeIfDocumentPipGone);
            document.removeEventListener('visibilitychange', closeIfDocumentPipGone);
            window.clearInterval(interval);
        };
    }, [pipActive, pipMode, closeIfDocumentPipGone]);

    useEffect(() => {
        if (pipMode !== 'element' || !pipActive) return;

        window.addEventListener('focus', closeIfElementPipGone);
        window.addEventListener('pageshow', closeIfElementPipGone);
        document.addEventListener('visibilitychange', closeIfElementPipGone);
        const interval = window.setInterval(closeIfElementPipGone, 1000);

        return () => {
            window.removeEventListener('focus', closeIfElementPipGone);
            window.removeEventListener('pageshow', closeIfElementPipGone);
            document.removeEventListener('visibilitychange', closeIfElementPipGone);
            window.clearInterval(interval);
        };
    }, [pipActive, pipMode, closeIfElementPipGone]);

    const enterPip = useCallback(async (): Promise<boolean> => {
        if (pipActive) return false;

        if (pipMode === 'document') {
            try {
                const win = await window.documentPictureInPicture!.requestWindow({
                    width: 480,
                    height: 270,
                    preferInitialWindowPlacement: true,
                });
                // Some browsers (Arc) close the Document PiP window when the user
                // switches tabs. pagehide is the reliable signal that the window
                // is gone — reset state so the button is clickable again.
                win.addEventListener('pagehide', closePip, { once: true });
                win.addEventListener('unload', closePip, { once: true });
                win.document.addEventListener('pagehide', closePip, { once: true });
                win.document.addEventListener('visibilitychange', () => {
                    if (win.document.visibilityState === 'hidden') closePip();
                });
                pipWindowRef.current = win;
                setPipWindow(win);
                setPipActive(true);
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
                video.addEventListener('leavepictureinpicture', closePip, { once: true });
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
            closePip();
        } else if (pipMode === 'element') {
            if (document.pictureInPictureElement) {
                try { await document.exitPictureInPicture(); } catch {}
            }
            closePip();
        }
    }, [pipActive, pipMode, closePip]);

    return { pipActive, pipWindow, pipMode, enterPip, exitPip };
}
