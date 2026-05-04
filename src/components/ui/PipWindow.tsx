"use client";
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface PipWindowProps {
    pipWindow: Window;
    children: React.ReactNode;
}

export function PipWindow({ pipWindow, children }: PipWindowProps) {
    const [ready, setReady] = useState(false);

    useEffect(() => {
        const pipDoc = pipWindow.document;

        // Mirror theme class (dark/light) from root document
        pipDoc.documentElement.className = document.documentElement.className;

        // Copy all <style> tags — Next.js injects global CSS and CSS variables here
        document.querySelectorAll('style').forEach(style => {
            pipDoc.head.appendChild(style.cloneNode(true));
        });

        // Copy <link rel="stylesheet"> for any external sheets
        document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]').forEach(link => {
            pipDoc.head.appendChild(link.cloneNode(true));
        });

        pipDoc.body.style.cssText = 'margin:0;padding:0;overflow:hidden;background:#000;width:100vw;height:100vh;';

        setReady(true);
    }, [pipWindow]);

    if (!ready) return null;
    return createPortal(children, pipWindow.document.body);
}
