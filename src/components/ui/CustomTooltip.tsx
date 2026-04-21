"use client";

import React from "react";

interface CustomTooltipProps {
  children: React.ReactNode;
  content: string;
  className?: string;
}

export function CustomTooltip({ children, content, className = "" }: CustomTooltipProps) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span
        className={`pointer-events-none absolute left-1/2 bottom-full mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-2 py-1 text-xs text-[hsl(var(--foreground))] opacity-0 shadow-lg transition-opacity group-hover:opacity-100 ${className}`}
      >
        {content}
      </span>
    </span>
  );
}
