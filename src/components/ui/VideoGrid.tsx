"use client";

import React, { useLayoutEffect, useMemo, useRef, useState } from "react";

interface VideoGridProps {
    children: React.ReactNode[];
    gap?: number; // px
    focusKey?: string | null;
    conversation?: boolean;
    tileAspect?: number; // width / height
}

interface Layout {
    cols: number;
    rows: number;
    tileWidth: number;
    tileHeight: number;
}

function computeLayout(count: number, width: number, height: number, gap: number, tileAspect: number): Layout {
    if (count <= 0 || width <= 0 || height <= 0) {
        return { cols: 1, rows: 1, tileWidth: 0, tileHeight: 0 };
    }

    const portrait = height > width;

    let best: Layout | null = null;
    let bestArea = 0;
    for (let cols = 1; cols <= count; cols++) {
        const rows = Math.ceil(count / cols);
        const availW = width - gap * (cols - 1);
        const availH = height - gap * (rows - 1);
        if (availW <= 0 || availH <= 0) continue;

        let tileWidth: number;
        let tileHeight: number;

        if (portrait) {
            tileHeight = Math.floor(availH / rows);
            tileWidth = Math.min(Math.floor(availW / cols), Math.floor(tileHeight * tileAspect));
        } else {
            const byW = availW / cols;
            const byH = (availH / rows) * tileAspect;
            tileWidth = Math.floor(Math.min(byW, byH));
            tileHeight = Math.floor(tileWidth / tileAspect);
        }

        // In portrait the row height (tileHeight) can vastly exceed what the 16:9
        // frame actually occupies. A cols=3 single-row layout scores 105×555=58k
        // while cols=1 three-row scores 318×179=57k — the wrong winner. Compare
        // using the effective video height (AR-capped) so the comparison reflects
        // visible content, not empty row space. tileHeight stays uncapped for
        // rendering so solo and two-tile portraits still fill the screen naturally.
        const effectiveH = portrait ? Math.min(tileHeight, Math.floor(tileWidth / tileAspect)) : tileHeight;
        const area = tileWidth * effectiveH;
        if (area > bestArea) {
            bestArea = area;
            best = { cols, rows, tileWidth, tileHeight };
        }
    }
    return best ?? { cols: 1, rows: 1, tileWidth: 0, tileHeight: 0 };
}

export function VideoGrid({ children, gap = 12, tileAspect = 16 / 9, focusKey, conversation = false }: VideoGridProps) {
    const ref = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState({ w: 0, h: 0 });

    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const ro = new ResizeObserver(() => {
            const r = el.getBoundingClientRect();
            setSize({ w: r.width, h: r.height });
        });
        ro.observe(el);
        const r = el.getBoundingClientRect();
        setSize({ w: r.width, h: r.height });
        return () => ro.disconnect();
    }, []);

    const count = React.Children.count(children);
    const layout = useMemo(
        () => computeLayout(count, size.w, size.h, gap, tileAspect),
        [count, size.w, size.h, gap, tileAspect],
    );

    const kids: React.ReactElement[] = [];
    React.Children.forEach(children, (child) => {
        if (React.isValidElement(child)) kids.push(child);
    });
    const focused = focusKey ? kids.findIndex((child) => String(child.key) === focusKey) : -1;
    const focusIndex = focused >= 0 ? focused : conversation && count === 2 ? 1 : -1;
    const thumbnails = kids.filter((_, index) => index !== focusIndex);
    const stripHeight = Math.min(100, size.h * 0.23);
    const thumbWidth = Math.min(
        160,
        Math.max(72, (size.w - gap * (thumbnails.length - 1)) / Math.max(1, thumbnails.length)),
    );

    return (
        <div ref={ref} className="relative h-full w-full overflow-hidden" data-testid="call-video-grid">
            {kids.map((child, index) => {
                let left = 0,
                    top = 0,
                    width = size.w,
                    height = size.h;
                if (focusIndex >= 0) {
                    if (index === focusIndex) {
                        height = Math.max(0, size.h - stripHeight - gap);
                    } else {
                        const stripIndex = thumbnails.indexOf(child);
                        width = thumbWidth;
                        height = stripHeight;
                        left =
                            (size.w - (thumbWidth * thumbnails.length + gap * (thumbnails.length - 1))) / 2 +
                            stripIndex * (thumbWidth + gap);
                        top = size.h - stripHeight;
                    }
                } else {
                    const row = Math.floor(index / layout.cols);
                    const rowCount = Math.min(layout.cols, count - row * layout.cols);
                    width = layout.tileWidth;
                    height = layout.tileHeight;
                    left =
                        (size.w - (rowCount * width + (rowCount - 1) * gap)) / 2 +
                        (index % layout.cols) * (width + gap);
                    top = (size.h - (layout.rows * height + (layout.rows - 1) * gap)) / 2 + row * (height + gap);
                }
                return (
                    <div
                        key={child.key ?? index}
                        className="call-tile-position absolute"
                        style={{ left, top, width, height }}
                    >
                        {child}
                    </div>
                );
            })}
        </div>
    );
}
