'use client'
import { useEffect, useRef } from 'react'
import { usePeerStore, type PeerStats, type EncodingLevel } from '@/src/stores/peer'
import { useMeetStore } from '@/src/stores/meet'
import type { SignalingClient } from '@/src/services/signaling/client'
import type { StatsReportPeer } from '@/src/services/signaling/protocol'
import type { WebRTCSession } from '@/src/services/webrtc/session'

const POLL_MS   = 2_000
const REPORT_MS = 30_000

// ─── Adaptive encoding levels ─────────────────────────────────────────────────
//
// Step-down trigger: high pressure for STEP_DOWN_SAMPLES consecutive polls,
//   or severe pressure immediately. Pressure is based on packet loss, RTT,
//   jitter, and whether the path is already TURN-relayed.
//
// Step-up trigger: low pressure for STEP_UP_SAMPLES consecutive polls. Five
//   clean samples = 10 s — conservative to prevent oscillation on marginal paths.

const STEP_DOWN_SAMPLES        = 2
const SEVERE_STEP_DOWN_SAMPLES = 1
const STEP_UP_SAMPLES          = 5
// Sustained bad samples at level 0 before outbound video is held back entirely.
// Severe paths hold after 6 s; merely poor paths hold after 16 s.
const AUDIO_ONLY_POOR_SAMPLES   = 8
const AUDIO_ONLY_SEVERE_SAMPLES = 3
const VIDEO_RESTORE_SAMPLES     = 5

// ─── Stats parsing ─────────────────────────────────────────────────────────────

export interface PrevEntry { bytesSent: number; bytesReceived: number; ts: number }

// RTCStatsReport entries are loosely typed in the DOM lib.
type StatsEntry = Record<string, any>
type NetworkPressure = PeerStats['networkPressure']

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

  const networkPressure = classifyNetworkPressure(packetLossPercent, rttMs, jitterMs, candidateType)
  let quality: PeerStats['quality'] = 'unknown'
  if (rttMs >= 0) {
    if      (networkPressure === 'low') quality = 'good'
    else if (networkPressure === 'medium') quality = 'medium'
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
    networkPressure,
    encodingLevel,
    videoHeld,
    timestamp: now,
    frameWidth,
    frameHeight,
    framesPerSecond,
  }
}

export function classifyNetworkPressure(
  loss: number,
  rttMs: number,
  jitterMs: number,
  candidateType: PeerStats['candidateType'] = 'unknown',
): NetworkPressure {
  if (rttMs < 0) return 'unknown'
  const relay = candidateType === 'relay'
  if (loss >= 12 || rttMs >= 700 || jitterMs >= 120 || (relay && loss >= 8)) return 'severe'
  if (loss >= 5 || rttMs >= 400 || jitterMs >= 80 || (relay && rttMs >= 500)) return 'high'
  if (loss >= 2 || rttMs >= 150 || jitterMs >= 30) return 'medium'
  return 'low'
}

// ─── Adaptive step function ───────────────────────────────────────────────────

export function stepAdaptation(
  peerId: string,
  session: WebRTCSession,
  stats: Pick<PeerStats, 'packetLossPercent' | 'roundTripTimeMs' | 'jitterMs' | 'candidateType' | 'networkPressure'>,
  levels:  Map<string, EncodingLevel>,
  badCnt:  Map<string, number>,
  goodCnt: Map<string, number>,
): EncodingLevel {
  const level = levels.get(peerId) ?? 2
  const pressure = stats.networkPressure
  const shouldStepDown = pressure === 'high' || pressure === 'severe'
  const shouldStepUp = pressure === 'low'

  if (shouldStepDown) {
    goodCnt.set(peerId, 0)
    const bad = (badCnt.get(peerId) ?? 0) + 1
    badCnt.set(peerId, bad)
    const threshold = pressure === 'severe' ? SEVERE_STEP_DOWN_SAMPLES : STEP_DOWN_SAMPLES
    if (bad >= threshold && level > 0) {
      const next = (level - 1) as EncodingLevel
      levels.set(peerId, next)
      badCnt.set(peerId, 0)
      console.info(
        '[adaptive] peer=%s ↓ level %d→%d pressure=%s loss=%.1f%% rtt=%dms jitter=%dms',
        peerId.slice(0, 8), level, next, pressure,
        stats.packetLossPercent, stats.roundTripTimeMs, stats.jitterMs,
      )
      void session.applyEncodingLevel(next)
      return next
    }
  } else if (shouldStepUp) {
    badCnt.set(peerId, 0)
    const good = (goodCnt.get(peerId) ?? 0) + 1
    goodCnt.set(peerId, good)
    if (good >= STEP_UP_SAMPLES && level < 2) {
      const next = (level + 1) as EncodingLevel
      levels.set(peerId, next)
      goodCnt.set(peerId, 0)
      console.info(
        '[adaptive] peer=%s ↑ level %d→%d pressure=%s loss=%.1f%% rtt=%dms jitter=%dms',
        peerId.slice(0, 8), level, next, pressure,
        stats.packetLossPercent, stats.roundTripTimeMs, stats.jitterMs,
      )
      void session.applyEncodingLevel(next)
      return next
    }
  } else {
    // Medium/unknown pressure holds current level and resets both counters.
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
      networkPressure:      s.networkPressure,
      roundTripTimeMs:      s.roundTripTimeMs,
      packetLossPercent:    s.packetLossPercent,
      outboundBitrateKbps:  s.outboundBitrateKbps,
      inboundBitrateKbps:   s.inboundBitrateKbps,
      candidateType:        s.candidateType,
      jitterMs:             s.jitterMs,
      encodingLevel:        s.encodingLevel,
      videoHeld:            s.videoHeld,
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
    const restoreCnt     = new Map<string, number>()
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
            id, conn.session, stats,
            adaptLevels, badSamples, goodSamples,
          )

          // ── Audio-only degradation ─────────────────────────────────────────
          // If we're already at the lowest encoding level and quality is still
          // poor, hold back outbound video entirely to preserve the audio path.
          if (newLevel === 0 && (stats.networkPressure === 'high' || stats.networkPressure === 'severe')) {
            const cnt = (audioOnlyCnt.get(id) ?? 0) + 1
            audioOnlyCnt.set(id, cnt)
            const threshold = stats.networkPressure === 'severe'
              ? AUDIO_ONLY_SEVERE_SAMPLES
              : AUDIO_ONLY_POOR_SAMPLES
            if (cnt >= threshold && !videoHeldPeers.has(id)) {
              console.info('[adaptive] peer=%s holding outbound video to protect audio', id.slice(0, 8))
              videoHeldPeers.add(id)
              void conn.session.replaceTrack('video', null)
              const { isMuted, isVideoOff, isScreenSharing } = useMeetStore.getState()
              clientRef.current?.send('peer-state', {
                audio: !isMuted,
                video: !isVideoOff,
                screenSharing: isScreenSharing,
                videoHeld: true,
              }, { to: id })
            }
          } else if (videoHeldPeers.has(id) && stats.networkPressure === 'low') {
            const restored = (restoreCnt.get(id) ?? 0) + 1
            restoreCnt.set(id, restored)
            // Quality has recovered and stayed clean — restore outbound video
            // if the user still has their camera on.
            const { isVideoOff } = useMeetStore.getState()
            if (restored >= VIDEO_RESTORE_SAMPLES && !isVideoOff && localVideoTrack) {
              console.info('[adaptive] peer=%s restoring outbound video after recovery', id.slice(0, 8))
              videoHeldPeers.delete(id)
              audioOnlyCnt.set(id, 0)
              restoreCnt.set(id, 0)
              void conn.session.replaceTrack('video', localVideoTrack)
              const { isMuted, isVideoOff, isScreenSharing } = useMeetStore.getState()
              clientRef.current?.send('peer-state', {
                audio: !isMuted,
                video: !isVideoOff,
                screenSharing: isScreenSharing,
                videoHeld: false,
              }, { to: id })
            }
          } else if (videoHeldPeers.has(id)) {
            restoreCnt.set(id, 0)
          } else if (!videoHeldPeers.has(id)) {
            restoreCnt.set(id, 0)
            if (stats.networkPressure === 'low' || stats.networkPressure === 'medium') {
              audioOnlyCnt.set(id, 0)
            }
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
          restoreCnt.delete(id)
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
