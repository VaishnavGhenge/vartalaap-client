'use client'

/**
 * Schedules escalating repair attempts for one thing that should be working
 * and isn't: a pushed track with no ack, or a pulled track with no media.
 *
 * The rule this encodes is the whole point of the reliability work: detection
 * ends in a repair, never in "report and stop". Before this, a dead pull was
 * permanent for the rest of the call because the only response to the timeout
 * was a Sentry message.
 *
 * Two deliberate choices:
 *
 * Attempts are unbounded. The call is the deadline. Giving up after N tries
 * would trade a call that eventually works for one that definitively doesn't,
 * and the current priority is the opposite: connecting slowly beats not
 * connecting. The loop is bounded in practice by its owner cancelling it when
 * the peer leaves or the call ends.
 *
 * The delay is capped. Pure exponential backoff on a two-hour call reaches
 * intervals nobody would wait through, so it plateaus and keeps trying at a
 * steady rate instead.
 */

export interface RepairLoopOptions {
  /** Highest rung to escalate to. Rung 1 is the cheapest local retry. */
  maxRung: number
  /** Runs one repair attempt. Throwing is caught and treated as a failed attempt. */
  repair: (rung: number, attempt: number) => void
  /** Attempts at each rung before escalating. */
  attemptsPerRung?: number
  baseDelayMs?: number
  maxDelayMs?: number
  /** Injectable for deterministic tests. */
  random?: () => number
}

const DEFAULT_ATTEMPTS_PER_RUNG = 2
const DEFAULT_BASE_DELAY_MS = 1_000
const DEFAULT_MAX_DELAY_MS = 30_000

export class RepairLoop {
  private timer: ReturnType<typeof setTimeout> | null = null
  private attemptCount = 0
  private cancelled = false
  private readonly opts: Required<RepairLoopOptions>

  constructor(opts: RepairLoopOptions) {
    this.opts = {
      attemptsPerRung: DEFAULT_ATTEMPTS_PER_RUNG,
      baseDelayMs: DEFAULT_BASE_DELAY_MS,
      maxDelayMs: DEFAULT_MAX_DELAY_MS,
      random: Math.random,
      ...opts,
    }
  }

  /** Attempts made since the last reset. Zero means healthy. */
  get attempts(): number {
    return this.attemptCount
  }

  /** True once at least one repair has been scheduled without a reset since. */
  get repairing(): boolean {
    return this.attemptCount > 0 || this.timer !== null
  }

  /** The rung the NEXT attempt will run at. */
  get nextRung(): number {
    return this.rungFor(this.attemptCount + 1)
  }

  /**
   * Arms the next attempt. Calling it while an attempt is already pending is a
   * no-op, so several failure signals for the same track (a pull that errors
   * and then times out) collapse into one repair rather than stacking.
   */
  schedule(): void {
    if (this.cancelled || this.timer !== null) return
    const attempt = this.attemptCount + 1
    const delay = this.delayFor(attempt)
    this.timer = setTimeout(() => {
      this.timer = null
      if (this.cancelled) return
      this.attemptCount = attempt
      try {
        this.opts.repair(this.rungFor(attempt), attempt)
      } catch {
        // A repair that throws is just a failed attempt. The caller re-arms on
        // the next failure signal; swallowing here keeps one bad rung from
        // taking down the timer that would have escalated past it.
      }
    }, delay)
  }

  /** Whatever was broken is working again. Clears the ladder back to rung 1. */
  reset(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.attemptCount = 0
  }

  /** Permanent teardown: the peer left, or the call ended. */
  cancel(): void {
    this.cancelled = true
    this.reset()
  }

  private rungFor(attempt: number): number {
    const rung = Math.ceil(attempt / this.opts.attemptsPerRung)
    return Math.min(rung, this.opts.maxRung)
  }

  private delayFor(attempt: number): number {
    const exponential = this.opts.baseDelayMs * 2 ** (attempt - 1)
    const capped = Math.min(exponential, this.opts.maxDelayMs)
    // Jitter across the full range rather than a narrow band around the target:
    // every peer in a room detects an SFU-wide outage within the same 2s poll,
    // so without real spread they would retry in lockstep and hit the edge as
    // one burst each round.
    return Math.round(capped * (0.5 + this.opts.random() * 0.5))
  }
}
