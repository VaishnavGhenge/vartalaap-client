'use client'

import { cn } from '@/src/lib/utils'

interface MicLevelMeterProps {
  level: number // 0–1
  active: boolean
  className?: string
}

// Renders a row of bars that animate with the mic level.
// `active` = mic is on; when off the bars show as muted/dim.
export function MicLevelMeter({ level, active, className }: MicLevelMeterProps) {
  const BAR_COUNT = 20

  return (
    <div
      role="meter"
      aria-label="Microphone level"
      aria-valuenow={Math.round(level * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn('flex items-end gap-[2px]', className)}
    >
      {Array.from({ length: BAR_COUNT }, (_, i) => {
        const threshold = (i + 1) / BAR_COUNT
        const lit = active && level >= threshold
        return (
          <span
            key={i}
            className={cn(
              'flex-1 rounded-sm transition-all duration-75',
              lit
                ? 'bg-[hsl(var(--primary))]'
                : 'bg-[hsl(var(--border))]',
            )}
            style={{ height: `${40 + (i / BAR_COUNT) * 60}%` }}
          />
        )
      })}
    </div>
  )
}
