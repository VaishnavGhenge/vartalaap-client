"use client";

import React, { useLayoutEffect, useMemo, useRef, useState } from "react";

interface VideoGridProps {
  children: React.ReactNode[];
  gap?: number; // px
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

  // In portrait orientation fill height first so tiles span the screen
  // rather than leaving dead space above/below (video uses object-cover to crop).
  const portrait = height > width;

  let best: Layout | null = null;
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const availW = width - gap * (cols - 1);
    const availH = height - gap * (rows - 1);
    if (availW <= 0 || availH <= 0) continue;

    let tileWidth: number;
    let tileHeight: number;

    if (portrait) {
      // Height-first: divide height evenly among rows, constrain width by aspect ratio
      tileHeight = Math.floor(availH / rows);
      tileWidth = Math.min(Math.floor(availW / cols), Math.floor(tileHeight * tileAspect));
    } else {
      // Width-first: maximize tile size while preserving aspect ratio
      const byW = availW / cols;
      const byH = (availH / rows) * tileAspect;
      tileWidth = Math.floor(Math.min(byW, byH));
      tileHeight = Math.floor(tileWidth / tileAspect);
    }

    const area = tileWidth * tileHeight;
    if (!best || area > best.tileWidth * best.tileHeight) {
      best = { cols, rows, tileWidth, tileHeight };
    }
  }
  return best ?? { cols: 1, rows: 1, tileWidth: 0, tileHeight: 0 };
}

export function VideoGrid({ children, gap = 12, tileAspect = 16 / 9 }: VideoGridProps) {
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

  const portrait = size.h > size.w;

  return (
    <div ref={ref} className="w-full h-full">
      <div
        className="w-full h-full grid place-items-center place-content-center"
        style={{
          gridTemplateColumns: portrait
            ? `repeat(${layout.cols}, 1fr)`
            : `repeat(${layout.cols}, ${layout.tileWidth}px)`,
          gridAutoRows: `${layout.tileHeight}px`,
          gap: `${gap}px`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
