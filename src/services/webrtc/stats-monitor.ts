'use client'

import { callDebug } from '@/src/lib/call-debug'

/**
 * Turns raw RTCStatsReports into "is media flowing right now", per stream,
 * per direction.
 *
 * Why this exists: before it, "a MediaStreamTrack was emitted once" was the
 * only definition of a working call. Nothing observed whether bytes kept
 * moving, so a call that froze at minute four looked identical to a healthy
 * one, and two SLOs in CLAUDE.md (in-call p99 RTT, unexpected disconnect
 * rate) had no producer at all.
 *
 * This module reports facts and takes no action. It never touches an
 * RTCPeerConnection — SfuSession.collectStats() owns that, per the client
 * CLAUDE.md rule — so the analysis here is a pure function of reports and is
 * testable without a fake PC.
 *
 * Deciding whether a given stall is a bug (versus a peer who simply muted)
 * needs the room's declared peer state, which lives in use-call, so inbound
 * stalls are handed up rather than judged here. Outbound stalls ARE judged
 * here, because `liveOutboundKinds` tells us whether media was expected.
 */

export type FlowDirection = 'publish' | 'subscribe'
export type FlowKind = 'audio' | 'video'

/** One PC's stats for one poll, as produced by SfuSession.collectStats(). */
export interface StatsSource {
  /** Stable across polls — keys the delta bookkeeping. */
  id: string
  direction: FlowDirection
  /** CF session id, for subscribe sources. */
  sessionId?: string
  report: RTCStatsReport
  /**
   * Kinds this PC's senders are live and enabled for. Publish sources only.
   * An outbound stream whose kind is absent here is a muted mic or a camera
   * that is off, which must never read as a stall.
   */
  liveOutboundKinds: FlowKind[]
}

/** One RTP stream's flow state at the current poll. */
export interface StreamFlow {
  kind: FlowKind
  ssrc: number
  bitrateKbps: number
  /** Bytes moved since the previous poll. */
  flowing: boolean
}

/** Everything one source reported at one poll. */
export interface TransportSample {
  sourceId: string
  direction: FlowDirection
  sessionId?: string
  outboundKbps: number
  inboundKbps: number
  packetLossPercent: number
  /** -1 when no succeeded candidate pair has reported an RTT yet. */
  roundTripTimeMs: number
  jitterMs: number
  candidateType: 'host' | 'srflx' | 'relay' | 'unknown'
  /** Mean inbound jitter-buffer delay per kind. Undefined until the browser
   * has emitted samples for that kind. */
  audioJitterBufferMs?: number
  videoJitterBufferMs?: number
  /** audioJitterBufferMs - videoJitterBufferMs, when both are known. */
  avSkewMs?: number
  frameWidth?: number
  frameHeight?: number
  framesPerSecond?: number
  flows: StreamFlow[]
}

/**
 * A stream that was flowing and then stopped, or one that has recovered.
 * `stalledForMs` is the silence at detection time on a stall, and the total
 * outage duration on a recovery.
 */
export interface FlowStall {
  sourceId: string
  direction: FlowDirection
  sessionId?: string
  kind: FlowKind
  ssrc: number
  stalledForMs: number
  /** The stream left getStats() entirely rather than going quiet in place. */
  vanished?: boolean
}

/**
 * How far a peer's audio playout has drifted from their video. Positive means
 * audio is behind, which is the direction a recovering jitter buffer produces
 * and what users describe as lips running ahead of the voice.
 */
export interface AvSkew {
  sourceId: string
  sessionId?: string
  skewMs: number
  audioJitterBufferMs: number
  videoJitterBufferMs: number
}

export interface StatsMonitorOptions {
  /** Re-read every poll so sources appearing mid-call are picked up. */
  collect: () => Promise<StatsSource[]>
  /** Fires once per poll with one sample per source. */
  onPoll?: (samples: TransportSample[]) => void
  /** A stream that had been flowing stopped moving bytes. */
  onStall?: (stall: FlowStall) => void
  /** A previously stalled stream started moving bytes again. */
  onRecover?: (stall: FlowStall) => void
  /** A peer's audio and video playout have drifted apart and stayed apart. */
  onAvSkew?: (skew: AvSkew) => void
  /** That drift came back inside the threshold. */
  onAvSkewRecover?: (skew: AvSkew) => void
  intervalMs?: number
  stallAfterMs?: number
  skewThresholdMs?: number
  /** Injectable for tests. */
  now?: () => number
}

export interface StatsMonitor {
  /** Runs one poll immediately. Exposed for tests; the interval calls it. */
  poll: () => Promise<void>
  stop: () => void
}

// Two seconds is short enough that a stall is noticed while the user is still
// deciding whether to complain, and long enough that report parsing stays off
// the critical path on low-end devices.
const DEFAULT_INTERVAL_MS = 2_000

// Three consecutive polls with zero bytes. One empty poll is normal (a keyframe
// gap, a scheduling hiccup); six seconds of silence on a stream that was
// flowing is not.
const DEFAULT_STALL_AFTER_MS = 6_000

// Lip sync is perceptible from roughly 45ms of audio lag; a quarter second is
// unambiguous and well clear of normal buffer jitter, so it is the point worth
// reporting rather than the point worth worrying about.
const DEFAULT_SKEW_THRESHOLD_MS = 250

// One poll over the threshold is a measurement blip. Two in a row is drift.
const SKEW_POLLS_TO_CONFIRM = 2

// Thresholds for the coarse quality grade the UI shows as a dot. Initial
// values, tuned against nothing yet — revisit once the histogram has real
// production traffic in it.
const RTT_GOOD_MS = 200
const RTT_MEDIUM_MS = 400
const LOSS_GOOD_PCT = 2
const LOSS_MEDIUM_PCT = 5

/** Per-stream delta bookkeeping. Keyed `${sourceId}|${io}|${ssrc}`. */
interface StreamRecord {
  /** Owning source, so pruning does not have to parse the key. */
  sourceId: string
  direction: FlowDirection
  sessionId?: string
  kind: FlowKind
  ssrc: number
  /** Wall clock of the last poll whose report still contained this stream. */
  lastSeenAt: number
  bytes: number
  /** Stats-report timestamp of the last reading, for accurate bitrate. */
  statsTs: number
  /** Wall clock of the last poll that saw bytes move. */
  lastFlowAt: number
  /**
   * Stalls are only meaningful for a stream that once worked. A stream that
   * never flowed at all is the dead-track case, already detected at pull time
   * by SfuSession — reporting it here too would double-count it.
   */
  everFlowed: boolean
  stalled: boolean
  /** Wall clock when the stall was reported, so recovery can say how long. */
  stalledSince: number
}

// Minimal shapes for the RTCStats dictionaries we read. RTCStatsReport.forEach
// hands out `any`, so narrowing happens here instead of at every callsite.
interface RtpStats {
  type: string
  id: string
  timestamp: number
  ssrc?: number
  kind?: string
  mediaType?: string
  bytesSent?: number
  bytesReceived?: number
  packetsReceived?: number
  packetsLost?: number
  jitter?: number
  frameWidth?: number
  frameHeight?: number
  framesPerSecond?: number
  jitterBufferDelay?: number
  jitterBufferEmittedCount?: number
}

interface CandidatePairStats {
  type: string
  state?: string
  nominated?: boolean
  selected?: boolean
  currentRoundTripTime?: number
  localCandidateId?: string
}

interface LocalCandidateStats {
  type: string
  id: string
  candidateType?: string
}

export function startStatsMonitor(opts: StatsMonitorOptions): StatsMonitor {
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS
  const stallAfterMs = opts.stallAfterMs ?? DEFAULT_STALL_AFTER_MS
  const skewThresholdMs = opts.skewThresholdMs ?? DEFAULT_SKEW_THRESHOLD_MS
  const now = opts.now ?? (() => Date.now())

  const streams = new Map<string, StreamRecord>()
  /** sourceId → consecutive polls over the skew threshold, and whether the
   * crossing has been reported. */
  const skewRuns = new Map<string, { polls: number; reported: boolean }>()
  let stopped = false

  const poll = async (): Promise<void> => {
    if (stopped) return

    let sources: StatsSource[]
    try {
      sources = await opts.collect()
    } catch {
      // Collection failing is not a call failure — a PC closing under us
      // rejects getStats(). Skip this poll; the next one re-reads the live set.
      return
    }
    if (stopped) return

    const t = now()

    // Drop bookkeeping for sources that went away (peer left, PC recreated).
    // Without this a departed peer's last-known stream keeps ageing past
    // stallAfterMs and reports a stall for media nobody is waiting for.
    const liveIds = new Set(sources.map((s) => s.id))
    for (const [key, record] of [...streams]) {
      if (!liveIds.has(record.sourceId)) streams.delete(key)
    }

    const samples = sources.map((source) => sampleSource(source, t))

    // A stream can leave getStats() entirely: the SFU stopped forwarding it,
    // or a renegotiation dropped the transceiver. The per-stat loop can only
    // judge streams it still sees, so without this sweep a track that
    // disappears is the one failure the monitor never reports — the tile keeps
    // its last frame and nothing says so. It is also why an audio stall was
    // recorded for a call whose video had stopped first.
    for (const record of streams.values()) {
      if (record.lastSeenAt === t || record.stalled || !record.everFlowed) continue
      const silentForMs = t - record.lastFlowAt
      if (silentForMs < stallAfterMs) continue
      record.stalled = true
      record.stalledSince = t
      callDebug.statsFlowStalled(record.direction, record.kind, silentForMs, record.sessionId)
      opts.onStall?.({
        sourceId: record.sourceId,
        direction: record.direction,
        sessionId: record.sessionId,
        kind: record.kind,
        ssrc: record.ssrc,
        stalledForMs: Math.round(silentForMs),
        vanished: true,
      })
    }

    for (const sample of samples) detectSkew(sample)

    if (samples.length > 0) opts.onPoll?.(samples)
  }

  const detectSkew = (sample: TransportSample): void => {
    const { avSkewMs, audioJitterBufferMs, videoJitterBufferMs } = sample
    if (avSkewMs === undefined || audioJitterBufferMs === undefined || videoJitterBufferMs === undefined) {
      skewRuns.delete(sample.sourceId)
      return
    }
    const run = skewRuns.get(sample.sourceId) ?? { polls: 0, reported: false }
    const skew: AvSkew = {
      sourceId: sample.sourceId,
      sessionId: sample.sessionId,
      skewMs: avSkewMs,
      audioJitterBufferMs: round(audioJitterBufferMs),
      videoJitterBufferMs: round(videoJitterBufferMs),
    }

    if (Math.abs(avSkewMs) < skewThresholdMs) {
      if (run.reported) opts.onAvSkewRecover?.(skew)
      skewRuns.delete(sample.sourceId)
      return
    }

    run.polls += 1
    if (run.polls >= SKEW_POLLS_TO_CONFIRM && !run.reported) {
      run.reported = true
      callDebug.statsAvSkew(sample.sessionId, avSkewMs)
      opts.onAvSkew?.(skew)
    }
    skewRuns.set(sample.sourceId, run)
  }

  const sampleSource = (source: StatsSource, t: number): TransportSample => {
    const rtp: RtpStats[] = []
    const pairs: CandidatePairStats[] = []
    const localCandidates = new Map<string, LocalCandidateStats>()
    source.report.forEach((raw: unknown) => {
      const s = raw as RtpStats & CandidatePairStats & LocalCandidateStats
      if (s.type === 'outbound-rtp' || s.type === 'inbound-rtp') rtp.push(s)
      else if (s.type === 'candidate-pair') pairs.push(s)
      else if (s.type === 'local-candidate') localCandidates.set(s.id, s)
    })

    const liveOutbound = new Set<FlowKind>(source.liveOutboundKinds)

    const flows: StreamFlow[] = []
    let outboundKbpsTotal = 0
    let inboundKbpsTotal = 0
    let packetsReceived = 0
    let packetsLost = 0
    let jitterMs = 0
    let frameWidth: number | undefined
    let frameHeight: number | undefined
    let framesPerSecond: number | undefined
    let audioJitterBufferMs: number | undefined
    let videoJitterBufferMs: number | undefined

    for (const s of rtp) {
      const kind = (s.kind ?? s.mediaType) as FlowKind | undefined
      if (kind !== 'audio' && kind !== 'video') continue
      const outbound = s.type === 'outbound-rtp'
      const bytes = outbound ? s.bytesSent : s.bytesReceived
      if (typeof bytes !== 'number') continue
      const ssrc = s.ssrc ?? 0
      const key = `${source.id}|${outbound ? 'out' : 'in'}|${ssrc}`

      const prev = streams.get(key)
      const deltaBytes = prev ? bytes - prev.bytes : 0
      // Prefer the stats-report clock for the rate: it is the clock the byte
      // counters were sampled against, so it survives a delayed poll.
      const deltaMs = prev && s.timestamp > prev.statsTs ? s.timestamp - prev.statsTs : intervalMs
      // bytes * 8 / milliseconds is exactly kilobits per second.
      const bitrateKbps = deltaBytes > 0 ? (deltaBytes * 8) / deltaMs : 0
      const flowing = deltaBytes > 0

      const record: StreamRecord = prev ?? {
        sourceId: source.id,
        direction: source.direction,
        sessionId: source.sessionId,
        kind,
        ssrc,
        lastSeenAt: t,
        bytes,
        statsTs: s.timestamp,
        lastFlowAt: t,
        everFlowed: false,
        stalled: false,
        stalledSince: 0,
      }
      record.bytes = bytes
      record.statsTs = s.timestamp
      record.lastSeenAt = t

      // Inbound: we cannot know from here whether the remote peer meant to
      // stop sending, so every inbound silence is reported and use-call
      // filters it against the peer's declared media state.
      const expected = outbound ? liveOutbound.has(kind) : true

      if (flowing) {
        record.lastFlowAt = t
        record.everFlowed = true
        if (record.stalled) {
          record.stalled = false
          const outageMs = t - record.stalledSince
          callDebug.statsFlowRecovered(source.direction, kind, source.sessionId)
          opts.onRecover?.(makeStall(source, kind, ssrc, outageMs))
        }
      } else if (!expected) {
        // Muted or camera off: hold the clock so the silence cannot accumulate
        // into a stall, and clear any stall already reported for this stream.
        record.lastFlowAt = t
        record.stalled = false
      } else if (record.everFlowed && !record.stalled && t - record.lastFlowAt >= stallAfterMs) {
        record.stalled = true
        record.stalledSince = t
        const stalledForMs = t - record.lastFlowAt
        callDebug.statsFlowStalled(source.direction, kind, stalledForMs, source.sessionId)
        opts.onStall?.(makeStall(source, kind, ssrc, stalledForMs))
      }
      streams.set(key, record)

      flows.push({ kind, ssrc, bitrateKbps: round(bitrateKbps), flowing })

      if (outbound) {
        outboundKbpsTotal += bitrateKbps
      } else {
        inboundKbpsTotal += bitrateKbps
        packetsReceived += s.packetsReceived ?? 0
        packetsLost += s.packetsLost ?? 0
        if (typeof s.jitter === 'number') jitterMs = Math.max(jitterMs, s.jitter * 1000)
        // Mean time each frame or sample waited in the jitter buffer. This is
        // the delay a user hears as lag, and comparing the two kinds is how
        // "video ahead of audio" becomes a number instead of a report.
        const bufferedMs = meanJitterBufferMs(s)
        if (bufferedMs !== undefined) {
          if (kind === 'audio') audioJitterBufferMs = bufferedMs
          else videoJitterBufferMs = bufferedMs
        }
        if (kind === 'video') {
          frameWidth = s.frameWidth ?? frameWidth
          frameHeight = s.frameHeight ?? frameHeight
          framesPerSecond = s.framesPerSecond ?? framesPerSecond
        }
      }
    }

    const pair = selectCandidatePair(pairs)
    const rttMs = pair && typeof pair.currentRoundTripTime === 'number'
      ? pair.currentRoundTripTime * 1000
      : -1
    const local = pair?.localCandidateId ? localCandidates.get(pair.localCandidateId) : undefined
    const totalPackets = packetsReceived + packetsLost

    return {
      sourceId: source.id,
      direction: source.direction,
      sessionId: source.sessionId,
      outboundKbps: round(outboundKbpsTotal),
      inboundKbps: round(inboundKbpsTotal),
      packetLossPercent: totalPackets > 0 ? round((packetsLost / totalPackets) * 100) : 0,
      roundTripTimeMs: rttMs < 0 ? -1 : round(rttMs),
      jitterMs: round(jitterMs),
      candidateType: normalizeCandidateType(local?.candidateType),
      audioJitterBufferMs,
      videoJitterBufferMs,
      avSkewMs: audioJitterBufferMs !== undefined && videoJitterBufferMs !== undefined
        ? round(audioJitterBufferMs - videoJitterBufferMs)
        : undefined,
      frameWidth,
      frameHeight,
      framesPerSecond: framesPerSecond !== undefined ? Math.round(framesPerSecond) : undefined,
      flows,
    }
  }

  const timer = setInterval(() => { void poll() }, intervalMs)

  return {
    poll,
    stop() {
      stopped = true
      clearInterval(timer)
      streams.clear()
      skewRuns.clear()
    },
  }
}

// jitterBufferDelay is cumulative seconds; dividing by the emitted count gives
// the mean wait per sample. Both counters are needed, and a stream that has
// emitted nothing yet has no meaningful delay.
function meanJitterBufferMs(s: RtpStats): number | undefined {
  const delay = s.jitterBufferDelay
  const emitted = s.jitterBufferEmittedCount
  if (typeof delay !== 'number' || typeof emitted !== 'number' || emitted <= 0) return undefined
  return (delay / emitted) * 1000
}

function makeStall(source: StatsSource, kind: FlowKind, ssrc: number, stalledForMs: number): FlowStall {
  return {
    sourceId: source.id,
    direction: source.direction,
    sessionId: source.sessionId,
    kind,
    ssrc,
    stalledForMs: Math.round(stalledForMs),
  }
}

// Chrome marks the live pair `nominated`; Firefox marks it `selected`. Fall
// back to any succeeded pair so an RTT is still reported on browsers that set
// neither flag.
function selectCandidatePair(pairs: CandidatePairStats[]): CandidatePairStats | undefined {
  return (
    pairs.find((p) => p.state === 'succeeded' && (p.nominated || p.selected)) ??
    pairs.find((p) => p.state === 'succeeded')
  )
}

function normalizeCandidateType(t: string | undefined): TransportSample['candidateType'] {
  if (t === 'host' || t === 'srflx' || t === 'relay') return t
  return 'unknown'
}

function round(n: number): number {
  return Math.round(n * 10) / 10
}

/**
 * Coarse grade for the per-tile quality dot. Kept next to the collector so the
 * thresholds and the numbers they judge stay in one file.
 */
export function gradeQuality(rttMs: number, lossPercent: number): 'good' | 'medium' | 'poor' | 'unknown' {
  if (rttMs < 0) return 'unknown'
  if (rttMs < RTT_GOOD_MS && lossPercent < LOSS_GOOD_PCT) return 'good'
  if (rttMs < RTT_MEDIUM_MS && lossPercent < LOSS_MEDIUM_PCT) return 'medium'
  return 'poor'
}

/**
 * How hard the network is pushing back. Separate from quality: quality is what
 * the user sees now, pressure is how much headroom is left before the
 * degradation ladder in CLAUDE.md has to act.
 */
export function gradeNetworkPressure(
  rttMs: number,
  lossPercent: number,
): 'low' | 'medium' | 'high' | 'severe' | 'unknown' {
  if (rttMs < 0) return 'unknown'
  if (lossPercent < 1 && rttMs < 150) return 'low'
  if (lossPercent < 3 && rttMs < 300) return 'medium'
  if (lossPercent < 8 && rttMs < 600) return 'high'
  return 'severe'
}
