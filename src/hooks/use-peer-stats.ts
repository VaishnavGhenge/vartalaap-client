'use client'
import { useEffect, useRef } from 'react'
import { usePeerStore, type PeerStats, type EncodingLevel } from '@/src/stores/peer'
import type { SignalingClient } from '@/src/services/signaling/client'
import type { StatsReportPeer } from '@/src/services/signaling/protocol'
import Peer from 'simple-peer'

const POLL_MS   = 2_000
const REPORT_MS = 30_000

// ─── Adaptive encoding levels ─────────────────────────────────────────────────
//
// Step-down trigger: packetLoss ≥ STEP_DOWN_LOSS_PCT for STEP_DOWN_SAMPLES
//   consecutive polls. Two bad samples = 4 s — fast enough to ease congestion
//   before GoogCC drives quality into the floor.
//
// Step-up trigger: packetLoss < STEP_UP_LOSS_PCT for STEP_UP_SAMPLES
//   consecutive polls. Five clean samples = 10 s — conservative to prevent
//   oscillation on marginal paths.

const ENCODING_LEVELS = [
  { maxBitrate: 200_000, scaleDown: 2.0, maxFps: 15 },  // 0: reduced
  { maxBitrate: 500_000, scaleDown: 1.5, maxFps: 20 },  // 1: medium
  { maxBitrate: 900_000, scaleDown: 1.0, maxFps: 24 },  // 2: full (default)
] as const

const STEP_DOWN_LOSS_PCT  = 5   // %
const STEP_DOWN_SAMPLES   = 2
const STEP_UP_LOSS_PCT    = 1   // %
const STEP_UP_SAMPLES     = 5

async function applyEncodingLevel(peer: Peer.Instance, level: EncodingLevel) {
  const pc = (peer as unknown as { _pc?: RTCPeerConnection })._pc
  if (!pc) return
  const sender = pc.getSenders().find(s => s.track?.kind === 'video')
  if (!sender) return

  const params = sender.getParameters()
  if (!params.encodings?.length) return

  const enc = ENCODING_LEVELS[level]
  params.encodings = params.encodings.map(e => ({
    ...e,
    maxBitrate:            enc.maxBitrate,
    maxFramerate:          enc.maxFps,
    scaleResolutionDownBy: enc.scaleDown,
  }))

  try {
    await sender.setParameters(params)
  } catch {
    // sender may be detached (camera off) — skip silently
  }
}

// ─── Stats parsing ─────────────────────────────────────────────────────────────

interface PrevEntry { bytesSent: number; bytesReceived: number; ts: number }

// RTCStatsReport entries are loosely typed in the DOM lib.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StatsEntry = Record<string, any>

function n(entry: StatsEntry, key: string): number {
  return typeof entry[key] === 'number' ? entry[key] : 0
}

function parseReport(
  report: RTCStatsReport,
  peerId: string,
  prevMap: Map<string, PrevEntry>,
  encodingLevel: EncodingLevel,
): PeerStats {
  const entries = Array.from(report.values()) as StatsEntry[]

  // candidate-pair: RTT + ICE path type
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

  // outbound-rtp: total bytes sent
  let bytesSent = 0
  for (const s of entries) {
    if (s.type === 'outbound-rtp') bytesSent += n(s, 'bytesSent')
  }

  // inbound-rtp: total bytes received + video frame info
  let bytesReceived = 0
  let jitterMs = 0
  let frameWidth: number | undefined
  let frameHeight: number | undefined
  let framesPerSecond: number | undefined
  for (const s of entries) {
    if (s.type === 'inbound-rtp') {
      bytesReceived += n(s, 'bytesReceived')
      if (s.kind === 'video') {
        jitterMs    = n(s, 'jitter') * 1000
        frameWidth  = typeof s.frameWidth      === 'number' ? s.frameWidth      : undefined
        frameHeight = typeof s.frameHeight     === 'number' ? s.frameHeight     : undefined
        framesPerSecond = typeof s.framesPerSecond === 'number'
          ? Math.round(s.framesPerSecond) : undefined
      }
    }
  }

  // remote-inbound-rtp: packet loss as seen by the remote peer (RTCP RR)
  let fractionLost = 0
  for (const s of entries) {
    if (s.type === 'remote-inbound-rtp') {
      fractionLost = Math.max(fractionLost, n(s, 'fractionLost'))
      if (rttMs < 0 && typeof s.roundTripTime === 'number') rttMs = s.roundTripTime * 1000
    }
  }

  // bitrate: bytes delta / elapsed time
  const now  = Date.now()
  const prev = prevMap.get(peerId)
  let outboundBitrateKbps = 0
  let inboundBitrateKbps  = 0
  if (prev && now > prev.ts) {
    const elapsedS = (now - prev.ts) / 1000
    outboundBitrateKbps = Math.max(0, Math.round((bytesSent      - prev.bytesSent)      * 8 / elapsedS / 1000))
    inboundBitrateKbps  = Math.max(0, Math.round((bytesReceived  - prev.bytesReceived)  * 8 / elapsedS / 1000))
  }
  prevMap.set(peerId, { bytesSent, bytesReceived, ts: now })

  const packetLossPercent = fractionLost * 100

  let quality: PeerStats['quality'] = 'unknown'
  if (rttMs >= 0) {
    if      (packetLossPercent < 2 && rttMs < 150) quality = 'good'
    else if (packetLossPercent < 8 && rttMs < 400) quality = 'medium'
    else                                            quality = 'poor'
  }

  return {
    outboundBitrateKbps,
    inboundBitrateKbps,
    packetLossPercent,
    roundTripTimeMs: rttMs >= 0 ? Math.round(rttMs) : -1,
    jitterMs: Math.round(jitterMs),
    candidateType,
    quality,
    encodingLevel,
    timestamp: now,
    frameWidth,
    frameHeight,
    framesPerSecond,
  }
}

// ─── Adaptive step function ───────────────────────────────────────────────────

function stepAdaptation(
  peerId: string,
  peer: Peer.Instance,
  loss: number,
  levels:  Map<string, EncodingLevel>,
  badCnt:  Map<string, number>,
  goodCnt: Map<string, number>,
): EncodingLevel {
  const level = levels.get(peerId) ?? 2

  if (loss >= STEP_DOWN_LOSS_PCT) {
    goodCnt.set(peerId, 0)
    const bad = (badCnt.get(peerId) ?? 0) + 1
    badCnt.set(peerId, bad)
    if (bad >= STEP_DOWN_SAMPLES && level > 0) {
      const next = (level - 1) as EncodingLevel
      levels.set(peerId, next)
      badCnt.set(peerId, 0)
      console.info('[adaptive] peer=%s ↓ level %d→%d  loss=%.1f%%', peerId.slice(0, 8), level, next, loss)
      void applyEncodingLevel(peer, next)
      return next
    }
  } else if (loss < STEP_UP_LOSS_PCT) {
    badCnt.set(peerId, 0)
    const good = (goodCnt.get(peerId) ?? 0) + 1
    goodCnt.set(peerId, good)
    if (good >= STEP_UP_SAMPLES && level < 2) {
      const next = (level + 1) as EncodingLevel
      levels.set(peerId, next)
      goodCnt.set(peerId, 0)
      console.info('[adaptive] peer=%s ↑ level %d→%d  loss=%.1f%%', peerId.slice(0, 8), level, next, loss)
      void applyEncodingLevel(peer, next)
      return next
    }
  } else {
    // middle band (1 ≤ loss < 5) — hold current level, reset both counters
    badCnt.set(peerId, 0)
    goodCnt.set(peerId, 0)
  }

  return level
}

// ─── Report payload ──────────────────────────────────────────────────────────

function buildReportPayload(): StatsReportPeer[] | null {
  const { peerConnections, peerStats } = usePeerStore.getState()
  if (peerConnections.size === 0) return null

  const peers: StatsReportPeer[] = []
  for (const [id] of peerConnections) {
    const s = peerStats.get(id)
    if (!s || s.quality === 'unknown') continue
    peers.push({
      peerId:               id,
      quality:              s.quality,
      roundTripTimeMs:      s.roundTripTimeMs,
      packetLossPercent:    s.packetLossPercent,
      outboundBitrateKbps:  s.outboundBitrateKbps,
      inboundBitrateKbps:   s.inboundBitrateKbps,
      candidateType:        s.candidateType,
      jitterMs:             s.jitterMs,
      frameWidth:           s.frameWidth,
      frameHeight:          s.frameHeight,
      framesPerSecond:      s.framesPerSecond,
    })
  }
  return peers.length > 0 ? peers : null
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePeerStats(client: SignalingClient | null) {
  const prevRef   = useRef<Map<string, PrevEntry>>(new Map())
  const clientRef = useRef(client)

  useEffect(() => { clientRef.current = client }, [client])

  useEffect(() => {
    // Adaptation state — lives for the duration of the call component.
    const adaptLevels  = new Map<string, EncodingLevel>()
    const badSamples   = new Map<string, number>()
    const goodSamples  = new Map<string, number>()

    // 2 s poll: collect WebRTC stats → store → run adaptive encoding step
    const pollTimer = setInterval(async () => {
      const { peerConnections, updatePeerStats } = usePeerStore.getState()

      for (const [id, conn] of peerConnections) {
        const pc = (conn.peer as unknown as { _pc?: RTCPeerConnection })._pc
        if (!pc || pc.connectionState === 'closed') continue

        try {
          const report       = await pc.getStats()
          const currentLevel = adaptLevels.get(id) ?? 2
          const stats        = parseReport(report, id, prevRef.current, currentLevel)

          // Run adaptive step — may update adaptLevels and call setParameters
          const newLevel = stepAdaptation(
            id, conn.peer, stats.packetLossPercent,
            adaptLevels, badSamples, goodSamples,
          )

          // Store final stats with the (possibly updated) encoding level
          updatePeerStats(id, { ...stats, encodingLevel: newLevel })
        } catch {
          // peer is closing — skip silently
        }
      }

      // Prune stale prev-entries for peers that left
      for (const id of prevRef.current.keys()) {
        if (!peerConnections.has(id)) {
          prevRef.current.delete(id)
          adaptLevels.delete(id)
          badSamples.delete(id)
          goodSamples.delete(id)
        }
      }
    }, POLL_MS)

    // 30 s report: emit stats snapshot over the existing WebSocket
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
  }, [])
}
