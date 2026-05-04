"use client";
import { useCallback, useState } from 'react';

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
    if ('pictureInPictureEnabled' in document && document.pictureInPictureEnabled) return 'element';
    return 'none';
}

// Prefer remote (unmuted) video for element PiP — more useful than local preview.
function findBestVideo(): HTMLVideoElement | null {
    return (
        document.querySelector<HTMLVideoElement>('video:not([muted])') ??
        document.querySelector<HTMLVideoElement>('video')
    );
}

export function usePip() {
    const [pipMode] = useState<PipMode>(detectPipMode);
    const [pipActive, setPipActive] = useState(false);
    const [pipWindow, setPipWindow] = useState<Window | null>(null);

    const enterPip = useCallback(async (): Promise<boolean> => {
        if (pipActive) return false;

        if (pipMode === 'document') {
            try {
                const win = await window.documentPictureInPicture!.requestWindow({
                    width: 480,
                    height: 270,
                    preferInitialWindowPlacement: true,
                });
                setPipWindow(win);
                setPipActive(true);
                win.addEventListener('pagehide', () => {
                    setPipActive(false);
                    setPipWindow(null);
                }, { once: true });
                return true;
            } catch {
                return false;
            }
        } else if (pipMode === 'element') {
            const video = findBestVideo();
            if (!video) return false;
            try {
                await video.requestPictureInPicture();
                setPipActive(true);
                video.addEventListener('leavepictureinpicture', () => setPipActive(false), { once: true });
                return true;
            } catch {
                return false;
            }
        }
        return false;
    }, [pipActive, pipMode]);

    const exitPip = useCallback(async () => {
        if (!pipActive) return;
        if (pipMode === 'document') {
            // pagehide listener on the pip window updates state
            window.documentPictureInPicture?.window?.close();
        } else if (pipMode === 'element' && document.pictureInPictureElement) {
            try { await document.exitPictureInPicture(); } catch {}
            setPipActive(false);
        }
    }, [pipActive, pipMode]);

    return { pipActive, pipWindow, pipMode, enterPip, exitPip };
}
