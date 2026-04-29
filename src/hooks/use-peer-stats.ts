'use client'
import { useEffect, useRef } from 'react'
import { usePeerStore, type PeerStats } from '@/src/stores/peer'
import type { SignalingClient } from '@/src/services/signaling/client'
import type { StatsReportPeer } from '@/src/services/signaling/protocol'

const POLL_MS = 2000
const REPORT_MS = 30_000

interface PrevEntry {
  bytesSent: number
  bytesReceived: number
  ts: number
}

// RTCStatsReport entries are loosely typed in the DOM lib — access via unknown map.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StatsEntry = Record<string, any>

function n(entry: StatsEntry, key: string): number {
  return typeof entry[key] === 'number' ? entry[key] : 0
}

function parseReport(
  report: RTCStatsReport,
  peerId: string,
  prevMap: Map<string, PrevEntry>,
): PeerStats {
  const entries = Array.from(report.values()) as StatsEntry[]

  // --- candidate-pair: RTT + ICE path type
  let rttMs = -1
  let candidateType: PeerStats['candidateType'] = 'unknown'

  for (const s of entries) {
    if (s.type === 'candidate-pair' && s.nominated === true) {
      rttMs = n(s, 'currentRoundTripTime') * 1000
      const local = report.get(s.localCandidateId ?? '') as StatsEntry | undefined
      if (local?.candidateType) candidateType = local.candidateType as PeerStats['candidateType']
      break
    }
  }

  // --- outbound-rtp: total bytes sent across audio + video senders
  let bytesSent = 0
  for (const s of entries) {
    if (s.type === 'outbound-rtp') bytesSent += n(s, 'bytesSent')
  }

  // --- inbound-rtp: total bytes received + video frame info
  let bytesReceived = 0
  let jitterMs = 0
  let frameWidth: number | undefined
  let frameHeight: number | undefined
  let framesPerSecond: number | undefined

  for (const s of entries) {
    if (s.type === 'inbound-rtp') {
      bytesReceived += n(s, 'bytesReceived')
      if (s.kind === 'video') {
        jitterMs = n(s, 'jitter') * 1000
        frameWidth = typeof s.frameWidth === 'number' ? s.frameWidth : undefined
        frameHeight = typeof s.frameHeight === 'number' ? s.frameHeight : undefined
        framesPerSecond =
          typeof s.framesPerSecond === 'number' ? Math.round(s.framesPerSecond) : undefined
      }
    }
  }

  // --- remote-inbound-rtp: packet loss as seen by the remote peer (from RTCP RR)
  let fractionLost = 0
  for (const s of entries) {
    if (s.type === 'remote-inbound-rtp') {
      fractionLost = Math.max(fractionLost, n(s, 'fractionLost'))
      // remote-inbound-rtp also carries RTT when candidate-pair didn't nominate yet
      if (rttMs < 0 && typeof s.roundTripTime === 'number') rttMs = s.roundTripTime * 1000
    }
  }

  // --- bitrate: bytes delta over elapsed time
  const now = Date.now()
  const prev = prevMap.get(peerId)
  let outboundBitrateKbps = 0
  let inboundBitrateKbps = 0

  if (prev && now > prev.ts) {
    const elapsedS = (now - prev.ts) / 1000
    outboundBitrateKbps = Math.max(0, Math.round((bytesSent - prev.bytesSent) * 8 / elapsedS / 1000))
    inboundBitrateKbps = Math.max(0, Math.round((bytesReceived - prev.bytesReceived) * 8 / elapsedS / 1000))
  }
  prevMap.set(peerId, { bytesSent, bytesReceived, ts: now })

  const packetLossPercent = fractionLost * 100

  // Quality thresholds from HPBN + GoogCC observable behaviour:
  // good: loss < 2%, RTT < 150ms  — imperceptible degradation
  // medium: loss < 8%, RTT < 400ms — noticeable but functional
  // poor: anything worse
  let quality: PeerStats['quality'] = 'unknown'
  if (rttMs >= 0) {
    if (packetLossPercent < 2 && rttMs < 150) quality = 'good'
    else if (packetLossPercent < 8 && rttMs < 400) quality = 'medium'
    else quality = 'poor'
  }

  return {
    outboundBitrateKbps,
    inboundBitrateKbps,
    packetLossPercent,
    roundTripTimeMs: rttMs >= 0 ? Math.round(rttMs) : -1,
    jitterMs: Math.round(jitterMs),
    candidateType,
    quality,
    timestamp: now,
    frameWidth,
    frameHeight,
    framesPerSecond,
  }
}

function buildReportPayload(): StatsReportPeer[] | null {
  const { peerConnections, peerStats } = usePeerStore.getState()
  if (peerConnections.size === 0) return null

  const peers: StatsReportPeer[] = []
  for (const [id] of peerConnections) {
    const s = peerStats.get(id)
    if (!s || s.quality === 'unknown') continue
    peers.push({
      peerId: id,
      quality: s.quality,
      roundTripTimeMs: s.roundTripTimeMs,
      packetLossPercent: s.packetLossPercent,
      outboundBitrateKbps: s.outboundBitrateKbps,
      inboundBitrateKbps: s.inboundBitrateKbps,
      candidateType: s.candidateType,
      jitterMs: s.jitterMs,
      frameWidth: s.frameWidth,
      frameHeight: s.frameHeight,
      framesPerSecond: s.framesPerSecond,
    })
  }
  return peers.length > 0 ? peers : null
}

export function usePeerStats(client: SignalingClient | null) {
  const prevRef = useRef<Map<string, PrevEntry>>(new Map())
  const clientRef = useRef(client)

  useEffect(() => {
    clientRef.current = client
  }, [client])

  useEffect(() => {
    // --- 2s poll: collect raw WebRTC stats and store in Zustand
    const pollTimer = setInterval(async () => {
      const { peerConnections, updatePeerStats } = usePeerStore.getState()

      for (const [id, conn] of peerConnections) {
        const pc = (conn.peer as unknown as { _pc?: RTCPeerConnection })._pc
        if (!pc || pc.connectionState === 'closed') continue
        try {
          const report = await pc.getStats()
          updatePeerStats(id, parseReport(report, id, prevRef.current))
        } catch {
          // peer is closing — skip silently
        }
      }

      // Prune stale prev-entries when peers leave
      for (const id of prevRef.current.keys()) {
        if (!peerConnections.has(id)) prevRef.current.delete(id)
      }
    }, POLL_MS)

    // --- 30s report: emit a stats snapshot over the existing WebSocket
    const reportTimer = setInterval(() => {
      const c = clientRef.current
      if (!c) return
      const peers = buildReportPayload()
      if (peers) c.send('stats-report', { peers })
    }, REPORT_MS)

    return () => {
      clearInterval(pollTimer)
      clearInterval(reportTimer)
    }
  }, []) // single pair of intervals for the lifetime of the call component
}
