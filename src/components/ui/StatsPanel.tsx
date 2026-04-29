'use client'

import { X, Activity } from 'lucide-react'
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

const QUALITY_DOT: Record<PeerStats['quality'], string> = {
  good:    'bg-emerald-400',
  medium:  'bg-amber-400',
  poor:    'bg-red-500',
  unknown: 'bg-zinc-400',
}

const QUALITY_LABEL: Record<PeerStats['quality'], string> = {
  good: 'Good', medium: 'Fair', poor: 'Poor', unknown: 'Measuring…',
}

const PATH_LABEL: Record<PeerStats['candidateType'], string> = {
  host:    'Direct (LAN)',
  srflx:   'STUN (NAT)',
  relay:   'TURN relay',
  unknown: '—',
}

export function StatsPanel({ rows, onClose }: StatsPanelProps) {
  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        className="fixed inset-0 z-30 bg-black/30 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        role="dialog"
        aria-label="Network stats"
        className="fixed inset-x-0 bottom-0 z-40 flex flex-col rounded-t-2xl
                   bg-[hsl(var(--surface)/0.97)] border-t border-[hsl(var(--border))]
                   backdrop-blur-xl shadow-2xl"
        style={{ maxHeight: '65dvh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 shrink-0
                        border-b border-[hsl(var(--border)/0.5)]">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[hsl(var(--primary))]" aria-hidden="true" />
            <span className="text-sm font-semibold">Network stats</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close stats"
            className="ctrl-btn ctrl-btn-on w-7 h-7"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto overscroll-contain">
          {rows.length === 0 ? (
            <p className="px-5 py-10 text-sm text-center text-[hsl(var(--muted-foreground))]">
              No peers connected
            </p>
          ) : (
            rows.map(({ id, name, stats }) => (
              <PeerStatsBlock
                key={id}
                name={name || id.slice(0, 8)}
                stats={stats}
              />
            ))
          )}
        </div>
      </div>
    </>
  )
}

function PeerStatsBlock({ name, stats }: { name: string; stats: PeerStats }) {
  return (
    <div className="px-5 py-4 border-b border-[hsl(var(--border)/0.4)] last:border-0">
      {/* Peer identity row */}
      <div className="flex items-center gap-2 mb-3.5">
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${QUALITY_DOT[stats.quality]}`}
          aria-hidden="true"
        />
        <span className="text-sm font-medium truncate">{name}</span>
        <span className="text-xs text-[hsl(var(--muted-foreground))] ml-0.5">
          {QUALITY_LABEL[stats.quality]}
        </span>
        {stats.candidateType === 'relay' && (
          <span className="ml-auto shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full
                           bg-amber-400/15 text-amber-600 dark:text-amber-400">
            via TURN
          </span>
        )}
      </div>

      {/* Stats grid — 2 columns */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        <StatRow label="Outbound" value={`${stats.outboundBitrateKbps} kbps`} />
        <StatRow label="Inbound" value={`${stats.inboundBitrateKbps} kbps`} />
        <StatRow
          label="Packet loss"
          value={`${stats.packetLossPercent.toFixed(1)}%`}
          level={stats.packetLossPercent >= 8 ? 'bad' : stats.packetLossPercent >= 2 ? 'warn' : 'ok'}
        />
        <StatRow
          label="RTT"
          value={stats.roundTripTimeMs >= 0 ? `${stats.roundTripTimeMs} ms` : '—'}
          level={stats.roundTripTimeMs >= 400 ? 'bad' : stats.roundTripTimeMs >= 150 ? 'warn' : 'ok'}
        />
        <StatRow label="Jitter" value={`${stats.jitterMs} ms`} />
        <StatRow label="Path" value={PATH_LABEL[stats.candidateType]} />
        {stats.frameWidth != null && stats.frameHeight != null && (
          <StatRow
            label="Resolution"
            value={`${stats.frameWidth}×${stats.frameHeight}${stats.framesPerSecond != null ? ` @ ${stats.framesPerSecond} fps` : ''}`}
          />
        )}
      </div>
    </div>
  )
}

function StatRow({
  label,
  value,
  level = 'ok',
}: {
  label: string
  value: string
  level?: 'ok' | 'warn' | 'bad'
}) {
  const valueColor =
    level === 'bad'
      ? 'text-red-500 dark:text-red-400'
      : level === 'warn'
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-[hsl(var(--foreground))]'

  return (
    <div className="flex flex-col gap-0.5">
      <span className="label-caps">{label}</span>
      <span className={`text-xs font-mono tabular-nums ${valueColor}`}>{value}</span>
    </div>
  )
}
