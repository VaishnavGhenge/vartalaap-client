'use client'

import type { SfuSession } from '@/src/services/webrtc/sfu-session'
import { callDebug } from '@/src/lib/call-debug'

/**
 * Holds what the room says should be flowing, compares it against what we have
 * actually subscribed to, and closes the gap.
 *
 * Before this, every subscription decision was made inside a single message
 * handler: an `sfu-tracks` arrived, we called subscribe, and that was the
 * entire mechanism. It had two consequences that no amount of retrying fixes.
 *
 * A lost broadcast was permanent. Nothing ever recomputed what we *should* be
 * receiving, so a peer whose announcement we missed simply stayed silent for
 * the rest of the call, and the client had no way to notice.
 *
 * A peer who rebuilt their publish connection leaked. They re-announce under a
 * NEW Cloudflare sessionId, and the old handler just overwrote the mapping —
 * leaving us subscribed to the dead session, paying for its subscribe
 * connection, and pulling tracks nobody was sending. Repair rung 2 (added in
 * step 3) makes publish rebuilds routine, which turned that from a rare leak
 * into an expected one.
 *
 * Both are the same bug: state derived from events instead of from state.
 * Reconciling desired against applied fixes them together.
 *
 * There is no timer here. The server pushes a room snapshot every 15s and each
 * one calls reconcile(), so the convergence tick already exists and adding a
 * second one would only duplicate it.
 */

export interface DesiredPeerTracks {
  peerId: string
  sessionId: string
  trackNames: string[]
}

export interface ReconcilerEvent {
  peerId: string
  sessionId: string
  trackNames: string[]
}

export type DropReason = 'peer-left' | 'session-replaced' | 'absent-from-snapshot'

export interface CallReconcilerOptions {
  /** Read live: the session does not exist yet when the first tracks arrive. */
  getSession: () => SfuSession | null
  onSubscribe?: (event: ReconcilerEvent) => void
  onDrop?: (event: ReconcilerEvent & { reason: DropReason }) => void
}

interface TrackSet {
  sessionId: string
  trackNames: Set<string>
}

export class CallReconciler {
  /** What the room says each peer publishes. */
  private readonly desired = new Map<string, TrackSet>()
  /** What we have actually told the SFU session to pull. */
  private readonly applied = new Map<string, TrackSet>()
  /** Reverse index so an arriving track can be attributed to a participant. */
  private readonly sessionToPeer = new Map<string, string>()
  /**
   * Highest room version applied. Updates carrying an older version are
   * discarded: without this, a snapshot already in flight when a peer
   * announces would roll that announcement back, and the track would go dark
   * until the next snapshot 15 seconds later.
   */
  private lastVersion = 0

  constructor(private readonly opts: CallReconcilerOptions) {}

  /** One peer announced their current set. */
  setPeerTracks(peerId: string, sessionId: string, trackNames: string[], version?: number): boolean {
    if (this.isStale(version)) {
      callDebug.reconcileStale('sfu-tracks', version ?? 0, this.lastVersion)
      return false
    }
    if (version) this.lastVersion = version
    this.desired.set(peerId, { sessionId, trackNames: new Set(trackNames) })
    return true
  }

  /** The room's full state. Replaces everything, which is the point of it. */
  applySnapshot(entries: DesiredPeerTracks[], version: number): boolean {
    if (this.isStale(version)) {
      callDebug.reconcileStale('room-snapshot', version, this.lastVersion)
      return false
    }
    this.lastVersion = version
    this.desired.clear()
    for (const entry of entries) {
      this.desired.set(entry.peerId, {
        sessionId: entry.sessionId,
        trackNames: new Set(entry.trackNames),
      })
    }
    return true
  }

  removePeer(peerId: string): void {
    this.desired.delete(peerId)
  }

  /** Signaling reconnected: our whole view is suspect until the next snapshot. */
  clear(): void {
    this.desired.clear()
    this.applied.clear()
    this.sessionToPeer.clear()
    this.lastVersion = 0
  }

  peerForSession(sessionId: string): string | undefined {
    return this.sessionToPeer.get(sessionId)
  }

  sessionForPeer(peerId: string): string | undefined {
    return this.applied.get(peerId)?.sessionId
  }

  /** Peers we are currently pulling from. Exposed for diagnostics and tests. */
  appliedPeers(): DesiredPeerTracks[] {
    return [...this.applied].map(([peerId, set]) => ({
      peerId,
      sessionId: set.sessionId,
      trackNames: [...set.trackNames],
    }))
  }

  /**
   * Converge. Idempotent and cheap: with nothing to change it walks two small
   * maps and does nothing, which is what lets it run on every snapshot.
   */
  reconcile(): void {
    const session = this.opts.getSession()
    // No session yet. Desired state is already recorded, so the call that
    // creates the session reconciles and picks all of it up — which is why the
    // old pending-message buffer is gone.
    if (!session) return

    for (const [peerId, want] of this.desired) {
      const have = this.applied.get(peerId)

      // The peer rebuilt their publish connection and came back under a new CF
      // session. Their old session's tracks are unpullable, and holding the
      // subscription open keeps paying for a connection receiving nothing.
      if (have && have.sessionId !== want.sessionId) {
        this.drop(session, peerId, have, 'session-replaced')
      }

      const applied = this.applied.get(peerId)
      const missing = [...want.trackNames].filter((name) => !applied?.trackNames.has(name))
      if (missing.length === 0) continue

      this.sessionToPeer.set(want.sessionId, peerId)
      // subscribe() is idempotent per (sessionId, trackName) and repairs a
      // broken pull when asked again, so re-issuing a known name is safe.
      session.subscribe(want.sessionId, missing).catch((e) => {
        console.error('[reconciler] subscribe failed', e)
      })
      callDebug.reconcileSubscribe(peerId, want.sessionId, missing)
      this.opts.onSubscribe?.({ peerId, sessionId: want.sessionId, trackNames: missing })
      this.applied.set(peerId, {
        sessionId: want.sessionId,
        trackNames: new Set([...(applied?.trackNames ?? []), ...missing]),
      })
    }

    for (const [peerId, have] of [...this.applied]) {
      if (this.desired.has(peerId)) continue
      this.drop(session, peerId, have, 'absent-from-snapshot')
    }
  }

  private drop(session: SfuSession, peerId: string, have: TrackSet, reason: DropReason): void {
    session.unsubscribePeer(have.sessionId)
    this.applied.delete(peerId)
    this.sessionToPeer.delete(have.sessionId)
    callDebug.reconcileDrop(peerId, have.sessionId, reason)
    this.opts.onDrop?.({
      peerId,
      sessionId: have.sessionId,
      trackNames: [...have.trackNames],
      reason,
    })
  }

  // A version of 0 or undefined means the sender did not stamp one, so there is
  // no ordering information and the update is applied as-is.
  private isStale(version: number | undefined): boolean {
    return !!version && version < this.lastVersion
  }
}
