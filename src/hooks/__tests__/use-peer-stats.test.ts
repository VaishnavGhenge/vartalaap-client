import { describe, it, expect, vi } from 'vitest'
import { parseReport, stepAdaptation, type PrevEntry } from '../use-peer-stats'
import type { EncodingLevel } from '@/src/stores/peer'
import type Peer from 'simple-peer'

// ─── parseReport ──────────────────────────────────────────────────────────────

function makeReport(entries: Array<{ id?: string } & Record<string, unknown>>): RTCStatsReport {
    const map = new Map<string, unknown>()
    entries.forEach((e, i) => {
        // Use the entry's own `id` as the map key so report.get(candidateId) resolves correctly.
        map.set(typeof e.id === 'string' ? e.id : String(i), e)
    })
    return map as unknown as RTCStatsReport
}

describe('parseReport – quality classification', () => {
    it('classifies "good" when loss < 2% and RTT < 150ms', () => {
        const report = makeReport([
            { type: 'candidate-pair', nominated: true, currentRoundTripTime: 0.05, localCandidateId: '1' },
            { type: 'candidate', id: '1', candidateType: 'host' },
            { type: 'remote-inbound-rtp', fractionLost: 0.005 },
        ])
        const stats = parseReport(report, 'peer1', new Map(), 2)
        expect(stats.quality).toBe('good')
    })

    it('classifies "medium" when loss is moderate or RTT is elevated', () => {
        const report = makeReport([
            { type: 'candidate-pair', nominated: true, currentRoundTripTime: 0.2, localCandidateId: '1' },
            { type: 'remote-inbound-rtp', fractionLost: 0.04 },
        ])
        const stats = parseReport(report, 'peer1', new Map(), 2)
        expect(stats.quality).toBe('medium')
    })

    it('classifies "poor" when loss >= 8% or RTT >= 400ms', () => {
        const report = makeReport([
            { type: 'candidate-pair', nominated: true, currentRoundTripTime: 0.5, localCandidateId: '1' },
            { type: 'remote-inbound-rtp', fractionLost: 0.1 },
        ])
        const stats = parseReport(report, 'peer1', new Map(), 2)
        expect(stats.quality).toBe('poor')
    })

    it('returns quality "unknown" when no RTT data is available', () => {
        const report = makeReport([])
        const stats = parseReport(report, 'peer1', new Map(), 2)
        expect(stats.quality).toBe('unknown')
        expect(stats.roundTripTimeMs).toBe(-1)
    })

    it('detects relay candidate type from localCandidateId', () => {
        const report = makeReport([
            { type: 'candidate-pair', nominated: true, currentRoundTripTime: 0.05, localCandidateId: 'c1' },
            { id: 'c1', type: 'local-candidate', candidateType: 'relay' },
        ])
        const stats = parseReport(report, 'peer1', new Map(), 2)
        expect(stats.candidateType).toBe('relay')
    })

    it('computes bitrate from prev/current byte delta', () => {
        const prevMap = new Map<string, PrevEntry>()
        const now = Date.now()
        prevMap.set('peer1', { bytesSent: 0, bytesReceived: 0, ts: now - 1000 })

        const report = makeReport([
            { type: 'outbound-rtp', bytesSent: 125_000 },   // 125 KB in 1 s = 1000 kbps
            { type: 'inbound-rtp', bytesReceived: 62_500 },  // 62.5 KB in 1 s = 500 kbps
        ])

        const stats = parseReport(report, 'peer1', prevMap, 2)
        // Allow ±50 kbps tolerance for timing jitter in tests
        expect(stats.outboundBitrateKbps).toBeGreaterThan(900)
        expect(stats.inboundBitrateKbps).toBeGreaterThan(450)
    })

    it('passes through video frame metrics', () => {
        const report = makeReport([
            { type: 'candidate-pair', nominated: true, currentRoundTripTime: 0.05 },
            { type: 'inbound-rtp', kind: 'video', bytesReceived: 0, jitter: 0.01,
              frameWidth: 1280, frameHeight: 720, framesPerSecond: 29.7 },
        ])
        const stats = parseReport(report, 'peer1', new Map(), 2)
        expect(stats.frameWidth).toBe(1280)
        expect(stats.frameHeight).toBe(720)
        expect(stats.framesPerSecond).toBe(30) // Math.round(29.7)
        expect(stats.jitterMs).toBe(10)        // 0.01 * 1000
    })
})

// ─── stepAdaptation ──────────────────────────────────────────────────────────

function makePeer(): Peer.Instance {
    return {
        destroyed: false,
        _pc: {
            getSenders: vi.fn(() => [
                { track: { kind: 'video' }, getParameters: vi.fn(() => ({ encodings: [{}] })), setParameters: vi.fn().mockResolvedValue(undefined) },
            ]),
        },
    } as unknown as Peer.Instance
}

describe('stepAdaptation – encoding level stepping', () => {
    it('steps down after STEP_DOWN_SAMPLES consecutive high-loss polls', () => {
        const levels = new Map<string, EncodingLevel>()
        const bad    = new Map<string, number>()
        const good   = new Map<string, number>()
        const peer   = makePeer()

        // First bad sample — should not step yet
        let level = stepAdaptation('p1', peer, 10, levels, bad, good)
        expect(level).toBe(2)

        // Second bad sample — should step down to 1
        level = stepAdaptation('p1', peer, 10, levels, bad, good)
        expect(level).toBe(1)
    })

    it('steps up after STEP_UP_SAMPLES consecutive clean polls', () => {
        const levels = new Map<string, EncodingLevel>([['p1', 0 as EncodingLevel]])
        const bad    = new Map<string, number>()
        const good   = new Map<string, number>()
        const peer   = makePeer()

        for (let i = 0; i < 4; i++) {
            const level = stepAdaptation('p1', peer, 0, levels, bad, good)
            expect(level).toBe(0) // not stepped yet
        }

        // 5th clean sample — should step up to 1
        const level = stepAdaptation('p1', peer, 0, levels, bad, good)
        expect(level).toBe(1)
    })

    it('holds level in the middle band (1% ≤ loss < 5%) and resets counters', () => {
        const levels = new Map<string, EncodingLevel>([['p1', 1 as EncodingLevel]])
        const bad    = new Map<string, number>([['p1', 3]])
        const good   = new Map<string, number>([['p1', 3]])
        const peer   = makePeer()

        const level = stepAdaptation('p1', peer, 3, levels, bad, good)
        expect(level).toBe(1)
        expect(bad.get('p1')).toBe(0)
        expect(good.get('p1')).toBe(0)
    })

    it('does not step below level 0', () => {
        const levels = new Map<string, EncodingLevel>([['p1', 0 as EncodingLevel]])
        const bad    = new Map<string, number>([['p1', 10]])
        const good   = new Map<string, number>()
        const peer   = makePeer()

        const level = stepAdaptation('p1', peer, 20, levels, bad, good)
        expect(level).toBe(0)
    })

    it('does not step above level 2', () => {
        const levels = new Map<string, EncodingLevel>([['p1', 2 as EncodingLevel]])
        const bad    = new Map<string, number>()
        const good   = new Map<string, number>([['p1', 10]])
        const peer   = makePeer()

        const level = stepAdaptation('p1', peer, 0, levels, bad, good)
        expect(level).toBe(2)
    })
})
