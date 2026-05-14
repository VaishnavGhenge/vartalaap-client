'use client'

import { X, BarChart2, ArrowUp, ArrowDown } from 'lucide-react'
import type { PeerStats } from '@/src/stores/peer'

export interface StatsPeerRow {
  id: string
  name: string
  stats: PeerStats
}

interface StatsPanelProps {
  rows: StatsPeerRow[]
  onClose: () => void
}

const MAX_BITRATE_KBPS = 900

const QUALITY_CONFIG: Record<PeerStats['quality'], { label: string; pill: string; bar: string }> = {
  good:    { label: 'Good',       pill: 'bg-emerald-500/15 text-emerald-500 dark:text-emerald-400', bar: 'bg-emerald-500' },
  medium:  { label: 'Fair',       pill: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',       bar: 'bg-amber-500' },
  poor:    { label: 'Poor',       pill: 'bg-red-500/15 text-red-500 dark:text-red-400',             bar: 'bg-red-500' },
  unknown: { label: 'Measuring',  pill: 'bg-zinc-500/15 text-zinc-500 dark:text-zinc-400',          bar: 'bg-zinc-400' },
}

const PATH_LABEL: Record<PeerStats['candidateType'], string> = {
  host:    'Direct',
  srflx:   'STUN',
  relay:   'TURN relay',
  unknown: '—',
}

const ENCODING_LABEL: Record<PeerStats['encodingLevel'], string> = {
  2: '900 kbps',
  1: '500 kbps',
  0: '200 kbps',
}

const PRESSURE_LABEL: Record<PeerStats['networkPressure'], string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  severe: 'Severe',
  unknown: '—',
}

type Level = 'ok' | 'warn' | 'bad'

const LEVEL_COLOR: Record<Level, string> = {
  ok:   'text-[hsl(var(--foreground))]',
  warn: 'text-amber-600 dark:text-amber-400',
  bad:  'text-red-500 dark:text-red-400',
}

function rttLevel(ms: number): Level {
  if (ms < 0) return 'ok'
  return ms >= 400 ? 'bad' : ms >= 150 ? 'warn' : 'ok'
}
function lossLevel(pct: number): Level {
  return pct >= 8 ? 'bad' : pct >= 2 ? 'warn' : 'ok'
}
function encLevel(l: PeerStats['encodingLevel']): Level {
  return l === 0 ? 'bad' : l === 1 ? 'warn' : 'ok'
}
function pressureLevel(p: PeerStats['networkPressure']): Level {
  return p === 'severe' || p === 'high' ? 'bad' : p === 'medium' ? 'warn' : 'ok'
}

// ── Sub-components ────────────────────────────────────────────────────────────

function BitrateBar({
  icon,
  label,
  kbps,
}: {
  icon: React.ReactNode
  label: string
  kbps: number
}) {
  const pct = Math.min(100, (kbps / MAX_BITRATE_KBPS) * 100)
  const barColor = kbps < 80 ? 'bg-amber-500' : 'bg-emerald-500'

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] text-[hsl(var(--muted-foreground))]">
          {icon}
          {label}
        </span>
        <span className="text-[11px] font-mono tabular-nums text-[hsl(var(--foreground))]">
          {kbps} kbps
        </span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-[hsl(var(--surface-3))]">
        <div
          className={`h-full rounded-full transition-[width] duration-700 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function Chip({ label, value, level = 'ok' }: { label: string; value: string; level?: Level }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-[hsl(var(--border)/0.35)]
                    bg-[hsl(var(--surface-2))]/50 px-3 py-2.5">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-[hsl(var(--muted-foreground))]">
        {label}
      </span>
      <span className={`text-sm font-mono tabular-nums font-medium leading-none ${LEVEL_COLOR[level]}`}>
        {value}
      </span>
    </div>
  )
}

function PeerCard({ name, stats }: { name: string; stats: PeerStats }) {
  const qc = QUALITY_CONFIG[stats.quality]

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-[hsl(var(--border)/0.4)]
                    bg-[hsl(var(--surface-2))]/40 p-4">

      {/* Identity + quality */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1 min-w-0">
          <span className="text-sm font-semibold truncate">{name}</span>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-[hsl(var(--muted-foreground))]">
              {PATH_LABEL[stats.candidateType]}
            </span>
            {stats.candidateType === 'relay' && (
              <span className="rounded-full bg-amber-400/15 px-1.5 py-px text-[10px] font-medium
                               text-amber-600 dark:text-amber-400">
                via TURN
              </span>
            )}
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${qc.pill}`}>
          {qc.label}
        </span>
      </div>

      {/* Bitrate bars */}
      <div className="flex flex-col gap-2.5">
        <BitrateBar
          icon={<ArrowUp className="h-3 w-3" aria-hidden />}
          label="Upload"
          kbps={stats.outboundBitrateKbps}
        />
        <BitrateBar
          icon={<ArrowDown className="h-3 w-3" aria-hidden />}
          label="Download"
          kbps={stats.inboundBitrateKbps}
        />
      </div>

      {/* Metric chips */}
      <div className="grid grid-cols-2 gap-2">
        <Chip
          label="RTT"
          value={stats.roundTripTimeMs >= 0 ? `${stats.roundTripTimeMs} ms` : '—'}
          level={rttLevel(stats.roundTripTimeMs)}
        />
        <Chip
          label="Packet loss"
          value={`${stats.packetLossPercent.toFixed(1)}%`}
          level={lossLevel(stats.packetLossPercent)}
        />
        <Chip label="Jitter" value={`${stats.jitterMs} ms`} />
        <Chip
          label="Encoding"
          value={stats.videoHeld ? 'Audio only' : ENCODING_LABEL[stats.encodingLevel]}
          level={encLevel(stats.encodingLevel)}
        />
        <Chip
          label="Pressure"
          value={PRESSURE_LABEL[stats.networkPressure]}
          level={pressureLevel(stats.networkPressure)}
        />
        {stats.frameWidth != null && stats.frameHeight != null && (
          <div className="col-span-2">
            <Chip
              label="Resolution"
              value={`${stats.frameWidth}×${stats.frameHeight}${stats.framesPerSecond != null ? ` · ${stats.framesPerSecond} fps` : ''}`}
            />
          </div>
        )}
      </div>

    </div>
  )
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export function StatsPanel({ rows, onClose }: StatsPanelProps) {
  return (
    <aside
      role="dialog"
      aria-label="Network stats"
      className="fixed inset-y-0 right-0 z-40 flex w-72 flex-col border-l
                 border-[hsl(var(--border))] bg-[hsl(var(--surface)/0.98)] shadow-2xl backdrop-blur-xl"
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-[hsl(var(--border)/0.5)] px-5 py-4">
        <div className="flex items-center gap-2">
          <BarChart2 className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden />
          <span className="text-sm font-semibold">Connection</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close stats"
          className="ctrl-btn ctrl-btn-on h-7 w-7"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 py-4">
        {rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-[hsl(var(--muted-foreground))]">
            No peers connected
          </p>
        ) : (
          rows.map(({ id, name, stats }) => (
            <PeerCard key={id} name={name || id.slice(0, 8)} stats={stats} />
          ))
        )}
      </div>
    </aside>
  )
}
