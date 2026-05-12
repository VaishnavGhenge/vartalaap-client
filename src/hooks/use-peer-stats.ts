'use client'
import { useEffect, useRef } from 'react'
import { usePeerStore, type PeerStats, type EncodingLevel } from '@/src/stores/peer'
import type { SignalingClient } from '@/src/services/signaling/client'
import type { StatsReportPeer } from '@/src/services/signaling/protocol'
import type { WebRTCSession } from '@/src/services/webrtc/session'

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

const STEP_DOWN_LOSS_PCT  = 5   // %
const STEP_DOWN_SAMPLES   = 2
const STEP_UP_LOSS_PCT    = 1   // %
const STEP_UP_SAMPLES     = 5
// Sustained bad samples at level 0 before outbound video is held back entirely.
// 8 × 2 s = 16 s at minimum bitrate with continued poor quality.
const AUDIO_ONLY_SAMPLES  = 8

// ─── Stats parsing ─────────────────────────────────────────────────────────────

export interface PrevEntry { bytesSent: number; bytesReceived: number; ts: number }

// RTCStatsReport entries are loosely typed in the DOM lib.
type StatsEntry = Record<string, any>

function n(entry: StatsEntry, key: string): number {
  return typeof entry[key] === 'number' ? entry[key] : 0
}

export function parseReport(
  report: RTCStatsReport,
  peerId: string,
  prevMap: Map<string, PrevEntry>,
  encodingLevel: EncodingLevel,
  videoHeld: boolean,
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
    videoHeld,
    timestamp: now,
    frameWidth,
    frameHeight,
    framesPerSecond,
  }
}

// ─── Adaptive step function ───────────────────────────────────────────────────

export function stepAdaptation(
  peerId: string,
  session: WebRTCSession,
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
      void session.applyEncodingLevel(next)
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
      void session.applyEncodingLevel(next)
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
    const adaptLevels    = new Map<string, EncodingLevel>()
    const badSamples     = new Map<string, number>()
    const goodSamples    = new Map<string, number>()
    const audioOnlyCnt   = new Map<string, number>()  // bad samples while at level 0
    const videoHeldPeers = new Set<string>()           // peers with outbound video held

    const pollTimer = setInterval(async () => {
      const { peerConnections, updatePeerStats, localStream } = usePeerStore.getState()
      const localVideoTrack = localStream?.getVideoTracks()[0] ?? null

      for (const [id, conn] of peerConnections) {
        if (conn.session.destroyed || conn.session.connectionState === 'closed') continue

        try {
          const report       = await conn.session.getStats()
          const currentLevel = adaptLevels.get(id) ?? 2
          const isHeld       = videoHeldPeers.has(id)
          const stats        = parseReport(report, id, prevRef.current, currentLevel, isHeld)

          const newLevel = stepAdaptation(
            id, conn.session, stats.packetLossPercent,
            adaptLevels, badSamples, goodSamples,
          )

          // ── Audio-only degradation ─────────────────────────────────────────
          // If we're already at the lowest encoding level and quality is still
          // poor, hold back outbound video entirely to preserve the audio path.
          if (newLevel === 0 && stats.quality === 'poor') {
            const cnt = (audioOnlyCnt.get(id) ?? 0) + 1
            audioOnlyCnt.set(id, cnt)
            if (cnt >= AUDIO_ONLY_SAMPLES && !videoHeldPeers.has(id)) {
              videoHeldPeers.add(id)
              void conn.session.replaceTrack('video', null)
            }
          } else if (videoHeldPeers.has(id) && stats.quality !== 'poor') {
            // Quality has recovered — restore outbound video if the user still
            // has their camera on (don't override a deliberate camera-off).
            const { isVideoOff } = (await import('@/src/stores/meet')).useMeetStore.getState()
            if (!isVideoOff && localVideoTrack) {
              videoHeldPeers.delete(id)
              audioOnlyCnt.set(id, 0)
              void conn.session.replaceTrack('video', localVideoTrack)
            }
          } else if (!videoHeldPeers.has(id)) {
            audioOnlyCnt.set(id, 0)
          }

          updatePeerStats(id, { ...stats, encodingLevel: newLevel, videoHeld: videoHeldPeers.has(id) })
        } catch {
          // session is closing — skip silently
        }
      }

      // Prune stale prev-entries for peers that left
      for (const id of prevRef.current.keys()) {
        if (!peerConnections.has(id)) {
          prevRef.current.delete(id)
          adaptLevels.delete(id)
          badSamples.delete(id)
          goodSamples.delete(id)
          audioOnlyCnt.delete(id)
          videoHeldPeers.delete(id)
        }
      }
    }, POLL_MS)

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
