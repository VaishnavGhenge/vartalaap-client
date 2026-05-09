"use client";
import { useRef } from 'react';
import { createPortal } from 'react-dom';

interface PipWindowProps {
    pipWindow: Window;
    children: React.ReactNode;
}

function preparePipDocument(pipDoc: Document) {
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
}

export function PipWindow({ pipWindow, children }: PipWindowProps) {
    // Prepare synchronously during the first render so that video elements
    // created by the portal have autoPlay fire while user activation (from
    // clicking the PiP button) is still valid. A useEffect-based approach
    // delays rendering by one commit cycle, by which point Chrome's autoplay
    // policy has consumed the activation and play() silently fails.
    const preparedRef = useRef<true | null>(null);
    if (preparedRef.current == null) {
        preparedRef.current = true;
        preparePipDocument(pipWindow.document);
    }

    return createPortal(children, pipWindow.document.body);
}
