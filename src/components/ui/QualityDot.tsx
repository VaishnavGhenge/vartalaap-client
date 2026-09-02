'use client'

import type { PeerStats } from '@/src/stores/peer'
import { cn } from '@/src/lib/utils'

export type CallQuality = PeerStats['quality']
export type NetworkPressure = PeerStats['networkPressure']

/**
 * Colour and wording for connection quality, in one place. Both the in-call
 * tile badge and the diagnostics panel read these, so a change to what "Fair"
 * means or looks like lands in both at once.
 */
export const QUALITY_DOT_COLOR: Record<CallQuality, string> = {
  good: 'bg-emerald-400',
  medium: 'bg-amber-400',
  poor: 'bg-red-500',
  unknown: 'bg-zinc-400',
}

export const QUALITY_LABEL: Record<CallQuality, string> = {
  good: 'Good',
  medium: 'Fair',
  poor: 'Poor',
  unknown: 'Measuring',
}

// Pressure answers "how much headroom is left", which is not the same question
// as quality. A call can look Good while already climbing.
export const PRESSURE_LABEL: Record<NetworkPressure, string> = {
  low: 'Plenty of headroom',
  medium: 'Some headroom',
  high: 'Little headroom',
  severe: 'Out of headroom',
  unknown: 'Measuring',
}

interface QualityDotProps {
  quality: CallQuality
  /** Renders the wording beside the dot. Off by default (badge use). */
  withLabel?: boolean
  /** Tailwind size class for the dot itself. */
  dotClassName?: string
  className?: string
  id?: string
}

export function QualityDot({ quality, withLabel, dotClassName, className, id }: QualityDotProps) {
  return (
    <span
      id={id}
      className={cn('inline-flex items-center gap-1.5', className)}
      role="img"
      aria-label={`Connection quality: ${QUALITY_LABEL[quality]}`}
    >
      <span className={cn('block size-2 rounded-full', QUALITY_DOT_COLOR[quality], dotClassName)} />
      {withLabel && <span className="text-xs font-medium">{QUALITY_LABEL[quality]}</span>}
    </span>
  )
}
