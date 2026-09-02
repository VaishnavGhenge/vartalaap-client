'use client'

import type { ReactNode } from 'react'
import { cn } from '@/src/lib/utils'

export type StatTone = 'neutral' | 'good' | 'warning' | 'danger'

const TONE_STYLES: Record<StatTone, string> = {
  neutral: 'text-[hsl(var(--foreground))]',
  good: 'text-emerald-600 dark:text-emerald-400',
  warning: 'text-amber-600 dark:text-amber-400',
  danger: 'text-[hsl(var(--destructive))]',
}

interface StatReadoutProps {
  label: string
  /** The measurement. Pass a placeholder for "not measured yet", never 0. */
  value: ReactNode
  unit?: string
  tone?: StatTone
  /** Short qualifier under the value, e.g. what the number is measured across. */
  hint?: string
  className?: string
  id?: string
}

/**
 * One labelled measurement. Digits use tabular figures so a column of these
 * stays aligned as values change, which is most of what makes a live readout
 * feel calm rather than twitchy.
 */
export function StatReadout({ label, value, unit, tone = 'neutral', hint, className, id }: StatReadoutProps) {
  return (
    <div id={id} className={cn('flex flex-col gap-0.5', className)}>
      <span className="text-[10px] font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
        {label}
      </span>
      <span className={cn('text-sm font-semibold tabular-nums', TONE_STYLES[tone])}>
        {value}
        {unit && <span className="ml-0.5 text-[10px] font-normal text-[hsl(var(--muted-foreground))]">{unit}</span>}
      </span>
      {hint && <span className="text-[10px] text-[hsl(var(--muted-foreground))]">{hint}</span>}
    </div>
  )
}
