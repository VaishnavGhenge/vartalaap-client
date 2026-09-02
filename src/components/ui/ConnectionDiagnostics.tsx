'use client'

import { useMemo, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { usePeerStore, type LocalStats, type MediaFlowEvent, type PeerStats } from '@/src/stores/peer'
import { PRESSURE_LABEL, QUALITY_LABEL, QualityDot } from '@/src/components/ui/QualityDot'
import { StatReadout, type StatTone } from '@/src/components/ui/StatReadout'
import { cn } from '@/src/lib/utils'

/**
 * Live per-call connection readout.
 *
 * This answers the question the quality dot cannot: when someone says "it
 * froze", what actually broke. Everything here comes from the stats monitor
 * (src/services/webrtc/stats-monitor.ts), which polls every two seconds.
 */

// Thresholds for colouring a number. Deliberately the same boundaries the
// stats monitor grades quality on, so a red RTT here and a red dot on the tile
// never disagree.
const RTT_WARN_MS = 200
const RTT_BAD_MS = 400
const LOSS_WARN_PCT = 2
const LOSS_BAD_PCT = 5
const JITTER_WARN_MS = 30
const JITTER_BAD_MS = 60

function toneFor(value: number, warn: number, bad: number): StatTone {
  if (value < 0) return 'neutral'
  if (value >= bad) return 'danger'
  if (value >= warn) return 'warning'
  return 'good'
}

function formatRtt(ms: number): string {
  return ms < 0 ? '—' : String(Math.round(ms))
}

function formatBitrate(kbps: number): string {
  if (kbps <= 0) return '0'
  if (kbps >= 1000) return (kbps / 1000).toFixed(1)
  return String(Math.round(kbps))
}

function bitrateUnit(kbps: number): string {
  return kbps >= 1000 ? 'Mbps' : 'kbps'
}

const ROUTE_LABEL: Record<PeerStats['candidateType'], string> = {
  host: 'Direct',
  srflx: 'Direct',
  relay: 'Relayed',
  unknown: 'Unknown',
}

// Relayed is not a fault: on restrictive networks TURN is the only path that
// works. It does add a hop, which is worth saying when latency looks high.
const ROUTE_HINT: Record<PeerStats['candidateType'], string> = {
  host: 'same network',
  srflx: 'peer to edge',
  relay: 'via TURN relay',
  unknown: 'still negotiating',
}

function relativeTime(at: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  return `${minutes}m ago`
}

function formatDuration(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`
}

interface PeerBlockProps {
  name: string
  stats: PeerStats | undefined
}

function PeerBlock({ name, stats }: PeerBlockProps) {
  if (!stats) {
    return (
      <div className="rounded-xl border border-[hsl(var(--border)/0.4)] bg-[hsl(var(--surface-2))]/60 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium">{name}</span>
          <span className="text-xs text-[hsl(var(--muted-foreground))]">Measuring</span>
        </div>
      </div>
    )
  }

  const resolution = stats.frameWidth && stats.frameHeight
    ? `${stats.frameWidth}×${stats.frameHeight}`
    : '—'

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[hsl(var(--border)/0.4)] bg-[hsl(var(--surface-2))]/60 px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium">{name}</span>
        <QualityDot quality={stats.quality} withLabel />
      </div>

      <div className="grid grid-cols-3 gap-x-3 gap-y-3">
        <StatReadout
          label="Latency"
          value={formatRtt(stats.roundTripTimeMs)}
          unit="ms"
          tone={toneFor(stats.roundTripTimeMs, RTT_WARN_MS, RTT_BAD_MS)}
        />
        <StatReadout
          label="Loss"
          value={stats.packetLossPercent.toFixed(1)}
          unit="%"
          tone={toneFor(stats.packetLossPercent, LOSS_WARN_PCT, LOSS_BAD_PCT)}
        />
        <StatReadout
          label="Jitter"
          value={Math.round(stats.jitterMs)}
          unit="ms"
          tone={toneFor(stats.jitterMs, JITTER_WARN_MS, JITTER_BAD_MS)}
        />
        <StatReadout
          label="Receiving"
          value={formatBitrate(stats.inboundBitrateKbps)}
          unit={bitrateUnit(stats.inboundBitrateKbps)}
        />
        <StatReadout label="Video" value={resolution} hint={stats.framesPerSecond ? `${stats.framesPerSecond} fps` : undefined} />
        <StatReadout
          label="Route"
          value={ROUTE_LABEL[stats.candidateType]}
          hint={ROUTE_HINT[stats.candidateType]}
        />
      </div>

      <p className="text-[10px] text-[hsl(var(--muted-foreground))]">
        {PRESSURE_LABEL[stats.networkPressure]}
      </p>
    </div>
  )
}

function FlowEventRow({ event, now }: { event: MediaFlowEvent; now: number }) {
  const stalled = event.outcome === 'stalled'
  const who = event.direction === 'publish' ? 'Your' : `${event.peerName ?? 'Their'}`
  const what = event.kind === 'video' ? 'video' : 'audio'
  return (
    <li className="flex items-baseline justify-between gap-2 text-[11px]">
      <span className={cn(stalled ? 'text-amber-600 dark:text-amber-400' : 'text-[hsl(var(--muted-foreground))]')}>
        {who} {what} {stalled ? 'stopped' : `resumed after ${formatDuration(event.durationMs)}`}
      </span>
      <span className="shrink-0 tabular-nums text-[hsl(var(--muted-foreground))]">
        {relativeTime(event.at, now)}
      </span>
    </li>
  )
}

/** Plain-text snapshot a participant can paste into a support message. */
function buildReport(
  localStats: LocalStats | null,
  peers: Array<{ id: string; name: string; stats: PeerStats | undefined }>,
  events: MediaFlowEvent[],
): string {
  const lines: string[] = ['Sessionly connection report', new Date().toISOString(), '']
  if (localStats) {
    lines.push(
      `Your uplink: ${formatBitrate(localStats.outboundBitrateKbps)} ${bitrateUnit(localStats.outboundBitrateKbps)}` +
      `, latency ${formatRtt(localStats.roundTripTimeMs)}ms, route ${ROUTE_LABEL[localStats.candidateType]}`,
    )
  } else {
    lines.push('Your uplink: not measured yet')
  }
  lines.push('')
  for (const p of peers) {
    if (!p.stats) {
      lines.push(`${p.name} (${p.id}): measuring`)
      continue
    }
    lines.push(
      `${p.name} (${p.id}): ${QUALITY_LABEL[p.stats.quality]}` +
      `, latency ${formatRtt(p.stats.roundTripTimeMs)}ms` +
      `, loss ${p.stats.packetLossPercent.toFixed(1)}%` +
      `, jitter ${Math.round(p.stats.jitterMs)}ms` +
      `, receiving ${formatBitrate(p.stats.inboundBitrateKbps)} ${bitrateUnit(p.stats.inboundBitrateKbps)}` +
      `, ${p.stats.frameWidth ?? '?'}x${p.stats.frameHeight ?? '?'}@${p.stats.framesPerSecond ?? '?'}fps` +
      `, route ${ROUTE_LABEL[p.stats.candidateType]}`,
    )
  }
  if (events.length > 0) {
    lines.push('', 'Recent interruptions:')
    for (const e of events) {
      lines.push(
        `  ${new Date(e.at).toISOString()} ${e.direction}/${e.kind} ${e.outcome} ${formatDuration(e.durationMs)}` +
        (e.peerName ? ` (${e.peerName})` : ''),
      )
    }
  }
  return lines.join('\n')
}

export function ConnectionDiagnostics() {
  const peerConnections = usePeerStore((s) => s.peerConnections)
  const peerStats = usePeerStore((s) => s.peerStats)
  const localStats = usePeerStore((s) => s.localStats)
  const mediaFlowEvents = usePeerStore((s) => s.mediaFlowEvents)
  const [copied, setCopied] = useState(false)

  const peers = useMemo(
    () => [...peerConnections.values()].map((p) => ({
      id: p.id,
      name: p.name || p.id.slice(0, 6),
      stats: peerStats.get(p.id),
    })),
    [peerConnections, peerStats],
  )

  // The clock comes from the newest stats poll rather than Date.now(): reading
  // the wall clock during render is impure, and a timer purely to re-stamp it
  // would add wakeups to say what the 2s poll already says. Falls back to the
  // newest event when the uplink has not reported yet.
  const now = localStats?.timestamp ?? mediaFlowEvents[0]?.at ?? 0

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(buildReport(localStats, peers, mediaFlowEvents))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard is permission-gated and unavailable on insecure origins.
      // Failing to copy is not worth an error dialog in a diagnostics panel.
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Our uplink is ONE stream to the SFU shared by every peer, so it is
          reported once here rather than repeated under each participant. */}
      <div className="flex flex-col gap-3 rounded-xl border border-[hsl(var(--border)/0.4)] bg-[hsl(var(--surface-2))]/60 px-4 py-3">
        <span className="text-sm font-medium">Your connection</span>
        {localStats ? (
          <div className="grid grid-cols-3 gap-x-3">
            <StatReadout
              label="Sending"
              value={formatBitrate(localStats.outboundBitrateKbps)}
              unit={bitrateUnit(localStats.outboundBitrateKbps)}
            />
            <StatReadout
              label="Latency"
              value={formatRtt(localStats.roundTripTimeMs)}
              unit="ms"
              tone={toneFor(localStats.roundTripTimeMs, RTT_WARN_MS, RTT_BAD_MS)}
            />
            <StatReadout
              label="Route"
              value={ROUTE_LABEL[localStats.candidateType]}
              hint={ROUTE_HINT[localStats.candidateType]}
            />
          </div>
        ) : (
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Measuring. This fills in a couple of seconds after your camera or mic starts sending.
          </p>
        )}
      </div>

      {peers.length === 0 ? (
        <p className="rounded-xl border border-[hsl(var(--border)/0.4)] bg-[hsl(var(--surface-2))]/60 px-4 py-3
                      text-sm text-[hsl(var(--muted-foreground))]">
          No one else is here yet. Per-participant numbers appear once someone joins.
        </p>
      ) : (
        peers.map((p) => <PeerBlock key={p.id} name={p.name} stats={p.stats} />)
      )}

      {mediaFlowEvents.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border border-[hsl(var(--border)/0.4)]
                        bg-[hsl(var(--surface-2))]/60 px-4 py-3">
          <span className="text-sm font-medium">Recent interruptions</span>
          <ul className="flex flex-col gap-1.5">
            {mediaFlowEvents.map((e) => <FlowEventRow key={e.id} event={e} now={now} />)}
          </ul>
        </div>
      )}

      <button
        type="button"
        onClick={() => { void copy() }}
        className="press inline-flex items-center justify-center gap-2 rounded-xl border
                   border-[hsl(var(--border)/0.4)] bg-[hsl(var(--surface-2))]/60 px-4 py-2.5
                   text-xs font-medium transition-colors hover:bg-[hsl(var(--surface-2))]
                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]/60"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? 'Copied' : 'Copy report'}
      </button>
    </div>
  )
}
