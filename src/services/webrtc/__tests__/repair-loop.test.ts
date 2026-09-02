import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RepairLoop } from '../repair-loop'

interface Attempt { rung: number; attempt: number }

function makeLoop(over: Partial<ConstructorParameters<typeof RepairLoop>[0]> = {}) {
    const attempts: Attempt[] = []
    const loop = new RepairLoop({
        maxRung: 2,
        // Fixed jitter so delays are deterministic: 0.5 + 0.5*0.5 = 0.75 of the
        // exponential value.
        random: () => 0.5,
        repair: (rung, attempt) => { attempts.push({ rung, attempt }) },
        ...over,
    })
    return { loop, attempts }
}

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('RepairLoop', () => {
    it('does nothing until scheduled', () => {
        const { loop, attempts } = makeLoop()
        expect(loop.repairing).toBe(false)
        vi.advanceTimersByTime(60_000)
        expect(attempts).toEqual([])
    })

    it('escalates a rung every two attempts and stops at maxRung', () => {
        const { loop, attempts } = makeLoop()
        // Each attempt has to be re-armed by a fresh failure signal, which is
        // how the real callers use it: detect, repair, detect again.
        for (let i = 0; i < 6; i++) {
            loop.schedule()
            vi.advanceTimersByTime(60_000)
        }
        expect(attempts.map((a) => a.rung)).toEqual([1, 1, 2, 2, 2, 2])
        expect(attempts.map((a) => a.attempt)).toEqual([1, 2, 3, 4, 5, 6])
    })

    it('backs off exponentially and then plateaus at the cap', () => {
        const { loop, attempts } = makeLoop({ baseDelayMs: 1_000, maxDelayMs: 4_000 })
        const fired: number[] = []
        for (let i = 0; i < 5; i++) {
            loop.schedule()
            // Walk forward in small steps to find when this attempt actually ran.
            let waited = 0
            while (attempts.length === i && waited < 60_000) {
                vi.advanceTimersByTime(50)
                waited += 50
            }
            fired.push(waited)
        }
        // 0.75 of 1000, 2000, 4000, then capped at 4000 for the rest.
        expect(fired).toEqual([750, 1_500, 3_000, 3_000, 3_000])
    })

    it('collapses several failure signals into one pending attempt', () => {
        // A pull can error AND time out for the same track. Both call schedule();
        // that must not stack two repairs and burn two rungs for one fault.
        const { loop, attempts } = makeLoop()
        loop.schedule()
        loop.schedule()
        loop.schedule()
        vi.advanceTimersByTime(60_000)
        expect(attempts).toHaveLength(1)
    })

    it('reset clears the ladder so the next fault starts cheap again', () => {
        const { loop, attempts } = makeLoop()
        for (let i = 0; i < 3; i++) {
            loop.schedule()
            vi.advanceTimersByTime(60_000)
        }
        expect(attempts.at(-1)?.rung).toBe(2)

        loop.reset()
        expect(loop.repairing).toBe(false)
        expect(loop.attempts).toBe(0)

        loop.schedule()
        vi.advanceTimersByTime(60_000)
        // A later, unrelated fault should try the cheap fix first rather than
        // inheriting the previous outage's escalation.
        expect(attempts.at(-1)?.rung).toBe(1)
    })

    it('reset cancels an attempt that has not fired yet', () => {
        const { loop, attempts } = makeLoop()
        loop.schedule()
        loop.reset()
        vi.advanceTimersByTime(60_000)
        expect(attempts).toEqual([])
    })

    it('cancel is permanent', () => {
        const { loop, attempts } = makeLoop()
        loop.cancel()
        loop.schedule()
        vi.advanceTimersByTime(60_000)
        expect(attempts).toEqual([])
    })

    it('keeps trying indefinitely — the call is the deadline, not an attempt count', () => {
        const { loop, attempts } = makeLoop()
        for (let i = 0; i < 50; i++) {
            loop.schedule()
            vi.advanceTimersByTime(60_000)
        }
        expect(attempts).toHaveLength(50)
    })

    it('survives a repair that throws', () => {
        // A rung that blows up is a failed attempt, not a broken ladder: the
        // next signal must still be able to escalate past it.
        const attempts: Attempt[] = []
        const loop = new RepairLoop({
            maxRung: 2,
            random: () => 0.5,
            repair: (rung, attempt) => {
                attempts.push({ rung, attempt })
                if (rung === 1) throw new Error('rung 1 blew up')
            },
        })
        for (let i = 0; i < 3; i++) {
            loop.schedule()
            vi.advanceTimersByTime(60_000)
        }
        expect(attempts.map((a) => a.rung)).toEqual([1, 1, 2])
    })

    it('reports the rung the next attempt would use', () => {
        const { loop } = makeLoop()
        expect(loop.nextRung).toBe(1)
        loop.schedule()
        vi.advanceTimersByTime(60_000)
        expect(loop.nextRung).toBe(1)
        loop.schedule()
        vi.advanceTimersByTime(60_000)
        expect(loop.nextRung).toBe(2)
    })
})
