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
    const effectiveH = portrait
      ? Math.min(tileHeight, Math.floor(tileWidth / tileAspect))
      : tileHeight;
    const area = tileWidth * effectiveH;
    if (area > bestArea) {
      bestArea = area;
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
  const portrait = size.h > size.w;
  const layout = useMemo(
    () => computeLayout(count, size.w, size.h, gap, tileAspect),
    [count, size.w, size.h, gap, tileAspect],
  );

  // ── Special case: 3 tiles in landscape → 2 on top, 1 centred below ──────────
  //
  // Generic 2×2 grid would leave an empty bottom-right cell.
  // Instead render two explicit rows so the lone tile is always centred.
  if (count === 3 && !portrait && size.w > 0 && size.h > 0) {
    const tileW = Math.floor(Math.min(
      (size.w - gap) / 2,
      ((size.h - gap) / 2) * tileAspect,
    ))
    const tileH = Math.floor(tileW / tileAspect)
    const kids = React.Children.toArray(children)

    return (
      <div ref={ref} className="w-full h-full flex flex-col items-center justify-center"
           style={{ gap }}>
        <div className="flex" style={{ gap }}>
          <div style={{ width: tileW, height: tileH }}>{kids[0]}</div>
          <div style={{ width: tileW, height: tileH }}>{kids[1]}</div>
        </div>
        <div style={{ width: tileW, height: tileH }}>{kids[2]}</div>
      </div>
    )
  }

  // ── Generic grid — centre incomplete last row ────────────────────────────────
  //
  // For counts like 5 (3+2) or 7 (3+3+1), the last row would otherwise be
  // left-aligned. Split children into full rows (rendered in a CSS grid) and
  // the partial last row (rendered in a centred flex container).

  const { cols, tileWidth: tileW, tileHeight: tileH } = layout
  const remainder = count % cols
  const lastRowIncomplete = remainder !== 0
  const kids = React.Children.toArray(children)

  const colTemplate = portrait
    ? `repeat(${cols}, 1fr)`
    : `repeat(${cols}, ${tileW}px)`

  if (!lastRowIncomplete) {
    // All rows are full — use a single CSS grid (original behaviour).
    return (
      <div ref={ref} className="w-full h-full">
        <div
          className="w-full h-full grid place-items-center place-content-center"
          style={{
            gridTemplateColumns: colTemplate,
            gridAutoRows: `${tileH}px`,
            gap,
          }}
        >
          {kids}
        </div>
      </div>
    )
  }

  // Some full rows + one incomplete last row.
  const fullKids = kids.slice(0, count - remainder)
  const lastKids = kids.slice(count - remainder)

  return (
    <div ref={ref} className="w-full h-full flex flex-col items-center justify-center"
         style={{ gap }}>
      {fullKids.length > 0 && (
        <div
          className="grid place-items-center"
          style={{
            gridTemplateColumns: colTemplate,
            gridAutoRows: `${tileH}px`,
            gap,
          }}
        >
          {fullKids}
        </div>
      )}
      <div className="flex justify-center" style={{ gap }}>
        {lastKids.map((child, i) => (
          <div key={i} style={{ width: tileW, height: tileH }}>{child}</div>
        ))}
      </div>
    </div>
  )
}
