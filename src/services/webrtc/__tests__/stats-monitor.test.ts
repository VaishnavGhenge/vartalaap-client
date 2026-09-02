import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import {
    gradeNetworkPressure,
    gradeQuality,
    startStatsMonitor,
    type AvSkew,
    type FlowStall,
    type StatsSource,
    type TransportSample,
} from '../stats-monitor'

// The monitor never touches an RTCPeerConnection — SfuSession.collectStats()
// owns that — so these tests drive it entirely with hand-built stats reports.
// That is the point of the split: the flow analysis is a pure function of
// (reports, clock) and the failure cases below are reachable without a browser.

function statsReport(entries: Array<Record<string, unknown>>): RTCStatsReport {
    return new Map(entries.map((e, i) => [String(i), e])) as unknown as RTCStatsReport
}

/** An inbound audio stream. `bytes` and `ts` advance across polls. */
function inboundAudio(bytes: number, ts: number, extra: Record<string, unknown> = {}) {
    return { type: 'inbound-rtp', id: 'in-a', kind: 'audio', ssrc: 111, timestamp: ts, bytesReceived: bytes, ...extra }
}

function inboundVideo(bytes: number, ts: number, extra: Record<string, unknown> = {}) {
    return { type: 'inbound-rtp', id: 'in-v', kind: 'video', ssrc: 333, timestamp: ts, bytesReceived: bytes, ...extra }
}

/** Jitter-buffer counters shaped as the spec defines them: cumulative seconds
 * over an emitted-sample count, so the mean is delay/count. */
function buffered(meanMs: number, emitted = 100) {
    return { jitterBufferDelay: (meanMs / 1000) * emitted, jitterBufferEmittedCount: emitted }
}

function outboundAudio(bytes: number, ts: number) {
    return { type: 'outbound-rtp', id: 'out-a', kind: 'audio', ssrc: 222, timestamp: ts, bytesSent: bytes }
}

beforeEach(() => {
    // The interval must never fire on its own: every test calls poll() directly
    // so the clock and the poll count stay under the test's control.
    vi.useFakeTimers()
})

afterEach(() => {
    vi.useRealTimers()
})

describe('flow detection', () => {
    it('derives bitrate from the byte delta over the stats clock', async () => {
        const samples: TransportSample[][] = []
        let sources: StatsSource[] = []
        const monitor = startStatsMonitor({
            collect: async () => sources,
            onPoll: (s) => samples.push(s),
            now: () => 0,
        })

        const subSource = (bytes: number, ts: number): StatsSource[] => [{
            id: 'sub:bob', direction: 'subscribe', sessionId: 'bob',
            report: statsReport([inboundAudio(bytes, ts)]),
            liveOutboundKinds: [],
        }]

        sources = subSource(1_000, 1_000)
        await monitor.poll()
        // First poll has no previous reading, so no rate can exist yet.
        expect(samples[0][0].flows[0]).toMatchObject({ kind: 'audio', bitrateKbps: 0, flowing: false })

        sources = subSource(2_000, 3_000)
        await monitor.poll()
        // 1000 bytes over 2000ms = 8000 bits / 2000 ms = 4 kbps.
        expect(samples[1][0].flows[0]).toMatchObject({ bitrateKbps: 4, flowing: true })
        expect(samples[1][0].inboundKbps).toBe(4)

        monitor.stop()
    })

    it('never stalls a stream that has not flowed once', async () => {
        // A track that never delivered a byte is the dead-track case, already
        // detected at pull time. Reporting it here as well would double-count
        // one failure as two.
        const stalls: FlowStall[] = []
        let clock = 0
        const monitor = startStatsMonitor({
            collect: async () => [{
                id: 'sub:bob', direction: 'subscribe', sessionId: 'bob',
                report: statsReport([inboundAudio(0, clock + 1_000)]),
                liveOutboundKinds: [],
            }],
            onStall: (s) => stalls.push(s),
            stallAfterMs: 6_000,
            now: () => clock,
        })

        for (const t of [0, 2_000, 4_000, 8_000, 30_000]) {
            clock = t
            await monitor.poll()
        }
        expect(stalls).toEqual([])
        monitor.stop()
    })

    it('stalls once after the silence threshold, then reports recovery with the outage', async () => {
        const stalls: FlowStall[] = []
        const recoveries: FlowStall[] = []
        let clock = 0
        let bytes = 1_000
        let ts = 1_000
        const monitor = startStatsMonitor({
            collect: async () => [{
                id: 'sub:bob', direction: 'subscribe', sessionId: 'bob',
                report: statsReport([inboundAudio(bytes, ts)]),
                liveOutboundKinds: [],
            }],
            onStall: (s) => stalls.push(s),
            onRecover: (s) => recoveries.push(s),
            stallAfterMs: 6_000,
            now: () => clock,
        })

        await monitor.poll()                                   // t=0, first reading
        clock = 2_000; bytes = 2_000; ts = 3_000
        await monitor.poll()                                   // flowing, lastFlowAt=2000
        clock = 4_000; ts = 5_000
        await monitor.poll()                                   // 2s of silence — not yet
        expect(stalls).toEqual([])

        clock = 8_000; ts = 9_000
        await monitor.poll()                                   // 6s of silence — stall
        expect(stalls).toHaveLength(1)
        expect(stalls[0]).toMatchObject({
            direction: 'subscribe', sessionId: 'bob', kind: 'audio', ssrc: 111, stalledForMs: 6_000,
        })

        clock = 10_000; ts = 11_000
        await monitor.poll()                                   // still silent — no repeat
        expect(stalls).toHaveLength(1)

        clock = 12_000; bytes = 3_000; ts = 13_000
        await monitor.poll()                                   // bytes again — recovered
        expect(recoveries).toHaveLength(1)
        // Outage is measured from when the stall was reported, not from the
        // last byte, so it answers "how long was the user staring at a frozen
        // tile" rather than restating the detection threshold.
        expect(recoveries[0].stalledForMs).toBe(4_000)

        monitor.stop()
    })

    it('does not stall outbound media the user muted', async () => {
        // A muted mic and a broken uplink produce identical byte counters. The
        // live sender kinds are what tell them apart.
        const stalls: FlowStall[] = []
        let clock = 0
        let bytes = 500
        let ts = 1_000
        let liveKinds: Array<'audio' | 'video'> = ['audio']
        const monitor = startStatsMonitor({
            collect: async () => [{
                id: 'pub', direction: 'publish',
                report: statsReport([outboundAudio(bytes, ts)]),
                liveOutboundKinds: liveKinds,
            }],
            onStall: (s) => stalls.push(s),
            stallAfterMs: 6_000,
            now: () => clock,
        })

        await monitor.poll()
        clock = 2_000; bytes = 1_500; ts = 3_000
        await monitor.poll()                                   // flowing
        // Mute: the sender goes away, bytes stop, and 20 seconds pass.
        liveKinds = []
        clock = 22_000; ts = 23_000
        await monitor.poll()
        expect(stalls).toEqual([])

        monitor.stop()
    })

    it('reports inbound silence even when the peer may have muted', async () => {
        // The monitor cannot see remote intent, so it reports and use-call
        // filters against the peer's declared media state. Reporting here and
        // filtering there keeps this module a pure observer.
        const stalls: FlowStall[] = []
        let clock = 0
        let bytes = 1_000
        let ts = 1_000
        const monitor = startStatsMonitor({
            collect: async () => [{
                id: 'sub:bob', direction: 'subscribe', sessionId: 'bob',
                report: statsReport([inboundAudio(bytes, ts)]),
                liveOutboundKinds: [],
            }],
            onStall: (s) => stalls.push(s),
            stallAfterMs: 6_000,
            now: () => clock,
        })

        await monitor.poll()
        clock = 2_000; bytes = 2_000; ts = 3_000
        await monitor.poll()
        clock = 9_000; ts = 10_000
        await monitor.poll()
        expect(stalls).toHaveLength(1)

        monitor.stop()
    })

    it('forgets a source that goes away so a departed peer cannot stall', async () => {
        const stalls: FlowStall[] = []
        let clock = 0
        let present = true
        const monitor = startStatsMonitor({
            collect: async () => present
                ? [{
                    id: 'sub:bob', direction: 'subscribe', sessionId: 'bob',
                    report: statsReport([inboundAudio(2_000, clock + 1_000)]),
                    liveOutboundKinds: [],
                }]
                : [{ id: 'pub', direction: 'publish', report: statsReport([]), liveOutboundKinds: [] }],
            onStall: (s) => stalls.push(s),
            stallAfterMs: 6_000,
            now: () => clock,
        })

        await monitor.poll()
        clock = 2_000
        await monitor.poll()

        // Bob leaves. His stream record must be dropped, otherwise it keeps
        // ageing and reports a stall for media nobody is waiting for.
        present = false
        clock = 30_000
        await monitor.poll()
        // Bob returns with a fresh session: treated as new, so the long gap
        // while he was gone cannot count as silence.
        present = true
        clock = 32_000
        await monitor.poll()
        expect(stalls).toEqual([])

        monitor.stop()
    })
})

describe('transport reporting', () => {
    it('reads RTT and candidate type from the nominated pair', async () => {
        let sample: TransportSample | undefined
        const monitor = startStatsMonitor({
            collect: async () => [{
                id: 'pub', direction: 'publish',
                report: statsReport([
                    { type: 'candidate-pair', id: 'p-failed', state: 'failed', currentRoundTripTime: 9 },
                    { type: 'candidate-pair', id: 'p-ok', state: 'succeeded', nominated: true, currentRoundTripTime: 0.084, localCandidateId: 'lc-1' },
                    { type: 'local-candidate', id: 'lc-1', candidateType: 'relay' },
                ]),
                liveOutboundKinds: [],
            }],
            onPoll: (s) => { sample = s[0] },
            now: () => 0,
        })
        await monitor.poll()
        expect(sample).toMatchObject({ roundTripTimeMs: 84, candidateType: 'relay' })
        monitor.stop()
    })

    it('falls back to a selected pair when no pair is nominated', async () => {
        // Firefox marks the live pair `selected` rather than `nominated`;
        // without the fallback, in-call RTT would be missing on Firefox only.
        let sample: TransportSample | undefined
        const monitor = startStatsMonitor({
            collect: async () => [{
                id: 'pub', direction: 'publish',
                report: statsReport([
                    { type: 'candidate-pair', id: 'p', state: 'succeeded', selected: true, currentRoundTripTime: 0.2, localCandidateId: 'lc' },
                    { type: 'local-candidate', id: 'lc', candidateType: 'srflx' },
                ]),
                liveOutboundKinds: [],
            }],
            onPoll: (s) => { sample = s[0] },
            now: () => 0,
        })
        await monitor.poll()
        expect(sample).toMatchObject({ roundTripTimeMs: 200, candidateType: 'srflx' })
        monitor.stop()
    })

    it('reports -1 for RTT rather than inventing a number', async () => {
        let sample: TransportSample | undefined
        const monitor = startStatsMonitor({
            collect: async () => [{
                id: 'pub', direction: 'publish',
                report: statsReport([{ type: 'candidate-pair', id: 'p', state: 'checking' }]),
                liveOutboundKinds: [],
            }],
            onPoll: (s) => { sample = s[0] },
            now: () => 0,
        })
        await monitor.poll()
        expect(sample?.roundTripTimeMs).toBe(-1)
        expect(sample?.candidateType).toBe('unknown')
        monitor.stop()
    })

    it('computes packet loss across every inbound stream', async () => {
        let sample: TransportSample | undefined
        const monitor = startStatsMonitor({
            collect: async () => [{
                id: 'sub:bob', direction: 'subscribe', sessionId: 'bob',
                report: statsReport([
                    inboundAudio(1_000, 1_000, { packetsReceived: 90, packetsLost: 10, jitter: 0.012 }),
                    { type: 'inbound-rtp', id: 'in-v', kind: 'video', ssrc: 333, timestamp: 1_000, bytesReceived: 5_000, packetsReceived: 900, packetsLost: 0, frameWidth: 960, frameHeight: 540, framesPerSecond: 23.6 },
                ]),
                liveOutboundKinds: [],
            }],
            onPoll: (s) => { sample = s[0] },
            now: () => 0,
        })
        await monitor.poll()
        // 10 lost of 1000 total.
        expect(sample).toMatchObject({
            packetLossPercent: 1, jitterMs: 12, frameWidth: 960, frameHeight: 540, framesPerSecond: 24,
        })
        monitor.stop()
    })
})

describe('resilience', () => {
    it('swallows a collect failure and keeps polling', async () => {
        // getStats() rejects when a PC closes under us. A stats poll failing
        // must never surface as a call failure.
        const samples: TransportSample[][] = []
        let fail = true
        const monitor = startStatsMonitor({
            collect: async () => {
                if (fail) throw new Error('pc closed')
                return [{ id: 'pub', direction: 'publish', report: statsReport([]), liveOutboundKinds: [] }]
            },
            onPoll: (s) => samples.push(s),
            now: () => 0,
        })

        await expect(monitor.poll()).resolves.toBeUndefined()
        expect(samples).toEqual([])

        fail = false
        await monitor.poll()
        expect(samples).toHaveLength(1)
        monitor.stop()
    })

    it('does not fire onPoll when there is nothing to report', async () => {
        const onPoll = vi.fn()
        const monitor = startStatsMonitor({ collect: async () => [], onPoll, now: () => 0 })
        await monitor.poll()
        expect(onPoll).not.toHaveBeenCalled()
        monitor.stop()
    })

    it('stops polling after stop()', async () => {
        const collect = vi.fn(async () => [])
        const monitor = startStatsMonitor({ collect, now: () => 0 })
        monitor.stop()
        await monitor.poll()
        expect(collect).not.toHaveBeenCalled()
    })
})

describe('grading', () => {
    it('grades quality from RTT and loss', () => {
        expect(gradeQuality(-1, 0)).toBe('unknown')
        expect(gradeQuality(80, 0.5)).toBe('good')
        expect(gradeQuality(80, 3)).toBe('medium')
        expect(gradeQuality(350, 1)).toBe('medium')
        expect(gradeQuality(800, 1)).toBe('poor')
        expect(gradeQuality(80, 20)).toBe('poor')
    })

    it('grades network pressure separately from quality', () => {
        // Pressure answers "how much headroom is left", so a call that still
        // looks good can already be under medium pressure.
        expect(gradeNetworkPressure(-1, 0)).toBe('unknown')
        expect(gradeNetworkPressure(100, 0.2)).toBe('low')
        expect(gradeNetworkPressure(180, 0.2)).toBe('medium')
        expect(gradeNetworkPressure(450, 5)).toBe('high')
        expect(gradeNetworkPressure(900, 12)).toBe('severe')
    })
})

// A stream that leaves getStats() entirely was the monitor's blind spot: the
// stall check ran inside the loop over reported stats, so a track the SFU
// stopped forwarding was never revisited and never flagged. In production this
// showed up as an audio stall being recorded for a call whose video had
// stopped first.
describe('a stream that disappears from the report', () => {
    it('is reported as a stall once the silence passes the threshold', async () => {
        const stalls: FlowStall[] = []
        let clock = 0
        let report = statsReport([inboundAudio(1_000, 0), inboundVideo(5_000, 0)])
        const monitor = startStatsMonitor({
            collect: async () => [{ id: 'sub:cf-a', direction: 'subscribe', sessionId: 'cf-a', report, liveOutboundKinds: [] }],
            onStall: (s) => stalls.push(s),
            now: () => clock,
        })

        await monitor.poll()
        clock = 2_000
        report = statsReport([inboundAudio(2_000, 2_000), inboundVideo(9_000, 2_000)])
        await monitor.poll()

        // Video vanishes from the report while audio keeps flowing.
        for (const [i, bytes] of [3_000, 4_000, 5_000, 6_000].entries()) {
            clock = 4_000 + i * 2_000
            report = statsReport([inboundAudio(bytes, clock)])
            await monitor.poll()
        }

        const video = stalls.filter((s) => s.kind === 'video')
        expect(video).toHaveLength(1)
        expect(video[0].vanished).toBe(true)
        expect(video[0].sessionId).toBe('cf-a')
        expect(video[0].stalledForMs).toBeGreaterThanOrEqual(6_000)
        expect(stalls.filter((s) => s.kind === 'audio')).toHaveLength(0)
        monitor.stop()
    })

    it('reports it once, not on every later poll', async () => {
        const stalls: FlowStall[] = []
        let clock = 0
        let report = statsReport([inboundVideo(5_000, 0)])
        const monitor = startStatsMonitor({
            collect: async () => [{ id: 'sub:cf-a', direction: 'subscribe', sessionId: 'cf-a', report, liveOutboundKinds: [] }],
            onStall: (s) => stalls.push(s),
            now: () => clock,
        })
        await monitor.poll()
        clock = 2_000
        report = statsReport([inboundVideo(9_000, 2_000)])
        await monitor.poll()

        report = statsReport([])
        for (let i = 0; i < 6; i++) { clock = 4_000 + i * 2_000; await monitor.poll() }

        expect(stalls).toHaveLength(1)
        monitor.stop()
    })

    it('says nothing when the whole peer connection goes away', async () => {
        const stalls: FlowStall[] = []
        let clock = 0
        let sources: StatsSource[] = [
            { id: 'sub:cf-a', direction: 'subscribe', sessionId: 'cf-a', report: statsReport([inboundVideo(5_000, 0)]), liveOutboundKinds: [] },
        ]
        const monitor = startStatsMonitor({
            collect: async () => sources,
            onStall: (s) => stalls.push(s),
            now: () => clock,
        })
        await monitor.poll()
        clock = 2_000
        sources = [{ id: 'sub:cf-a', direction: 'subscribe', sessionId: 'cf-a', report: statsReport([inboundVideo(9_000, 2_000)]), liveOutboundKinds: [] }]
        await monitor.poll()

        // The peer left, so the source is gone. Nobody is waiting for it.
        sources = []
        for (let i = 0; i < 6; i++) { clock = 4_000 + i * 2_000; await monitor.poll() }

        expect(stalls).toHaveLength(0)
        monitor.stop()
    })
})

// "Video was faster and audio was delayed, then it synced itself after a few
// minutes" had no number behind it anywhere in the app.
describe('audio/video sync', () => {
    const source = (audioMs: number, videoMs: number, ts: number): StatsSource[] => ([{
        id: 'sub:cf-a', direction: 'subscribe', sessionId: 'cf-a', liveOutboundKinds: [],
        report: statsReport([
            inboundAudio(1_000 * (ts + 1), ts, buffered(audioMs)),
            inboundVideo(5_000 * (ts + 1), ts, buffered(videoMs)),
        ]),
    }])

    it('measures the gap between the two playout delays', async () => {
        const samples: TransportSample[][] = []
        let sources = source(420, 40, 0)
        const monitor = startStatsMonitor({
            collect: async () => sources,
            onPoll: (s) => samples.push(s),
            now: () => 0,
        })

        await monitor.poll()

        expect(samples[0][0].audioJitterBufferMs).toBeCloseTo(420, 0)
        expect(samples[0][0].videoJitterBufferMs).toBeCloseTo(40, 0)
        expect(samples[0][0].avSkewMs).toBeCloseTo(380, 0)
        monitor.stop()
    })

    it('waits for a second poll before calling it drift', async () => {
        const skews: AvSkew[] = []
        let sources = source(420, 40, 0)
        const monitor = startStatsMonitor({
            collect: async () => sources,
            onAvSkew: (s) => skews.push(s),
            now: () => 0,
        })

        await monitor.poll()
        expect(skews).toHaveLength(0)

        sources = source(420, 40, 1)
        await monitor.poll()
        expect(skews).toHaveLength(1)
        expect(skews[0].skewMs).toBeCloseTo(380, 0)
        monitor.stop()
    })

    it('stays quiet while the two delays are close', async () => {
        const skews: AvSkew[] = []
        let sources = source(60, 40, 0)
        const monitor = startStatsMonitor({
            collect: async () => sources,
            onAvSkew: (s) => skews.push(s),
            now: () => 0,
        })

        for (let i = 0; i < 5; i++) { sources = source(60, 40, i); await monitor.poll() }

        expect(skews).toHaveLength(0)
        monitor.stop()
    })

    // The self-healing the user described: the buffer drains and lip sync
    // returns without anyone doing anything.
    it('reports the recovery when the buffer drains', async () => {
        const skews: AvSkew[] = []
        const recovered: AvSkew[] = []
        let sources = source(420, 40, 0)
        const monitor = startStatsMonitor({
            collect: async () => sources,
            onAvSkew: (s) => skews.push(s),
            onAvSkewRecover: (s) => recovered.push(s),
            now: () => 0,
        })

        await monitor.poll()
        sources = source(420, 40, 1)
        await monitor.poll()
        expect(skews).toHaveLength(1)

        sources = source(70, 40, 2)
        await monitor.poll()

        expect(recovered).toHaveLength(1)
        expect(recovered[0].skewMs).toBeCloseTo(30, 0)
        monitor.stop()
    })

    it('reports nothing when the browser gives no buffer counters', async () => {
        const skews: AvSkew[] = []
        let clock = 0
        const monitor = startStatsMonitor({
            collect: async () => [{
                id: 'sub:cf-a', direction: 'subscribe', sessionId: 'cf-a', liveOutboundKinds: [],
                report: statsReport([inboundAudio(1_000, clock), inboundVideo(5_000, clock)]),
            }],
            onAvSkew: (s) => skews.push(s),
            now: () => clock,
        })

        for (let i = 0; i < 4; i++) { clock = i * 2_000; await monitor.poll() }

        expect(skews).toHaveLength(0)
        monitor.stop()
    })
})
