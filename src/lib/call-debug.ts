/**
 * Debug logger for the video call stack. Only active in development.
 *
 * Usage in DevTools:
 *   window.__call_debug           → live snapshot of call state
 *   window.__call_debug.log       → full ordered event log
 *   window.__call_debug.reset()   → clear the log
 *
 * Filter console output:
 *   [sig]  — signaling WebSocket messages
 *   [sfu]  — SFU session lifecycle (publish, subscribe, tracks)
 *   [rec]  — reconciler (desired vs applied subscriptions, snapshots)
 *   [call] — use-call lifecycle (join, ICE, TTFM)
 */

const isDev = process.env.NODE_ENV === 'development'

interface CallDebugEntry {
  t: number       // ms since callDebug.init()
  tag: string
  msg: string
  data?: unknown
}

interface CallDebugState {
  log: CallDebugEntry[]
  t0: number
  sigMessagesIn: number
  sigMessagesOut: number
  sfuPublishSessions: string[]
  sfuSubscribeSessions: string[]
  remoteTracks: Array<{ sessionId: string; trackName: string; kind: string }>
  pullTimers: string[]
  connStates: Record<string, RTCPeerConnectionState>
  // Live reference to the active SfuSession — usable from DevTools console
  // or smoke tests to call .publish() / .subscribe() directly.
  sfuSession: any | null
  reset: () => void
}

const state: CallDebugState = {
  log: [],
  t0: 0,
  sigMessagesIn: 0,
  sigMessagesOut: 0,
  sfuPublishSessions: [],
  sfuSubscribeSessions: [],
  remoteTracks: [],
  pullTimers: [],
  connStates: {},
  sfuSession: null,
  reset() {
    state.log = []
    state.t0 = performance.now()
    state.sigMessagesIn = 0
    state.sigMessagesOut = 0
    state.sfuPublishSessions = []
    state.sfuSubscribeSessions = []
    state.remoteTracks = []
    state.pullTimers = []
    state.connStates = {}
    state.sfuSession = null
  },
}

if (isDev && typeof window !== 'undefined') {
  ;(window as any).__call_debug = state
}

function elapsed(): number {
  return state.t0 ? Math.round(performance.now() - state.t0) : 0
}

function push(tag: string, msg: string, data?: unknown) {
  const entry: CallDebugEntry = { t: elapsed(), tag, msg, data }
  state.log.push(entry)
  if (data !== undefined) {
    console.log(`%c${tag}%c +${entry.t}ms ${msg}`, 'color:#7c3aed;font-weight:bold', 'color:inherit', data)
  } else {
    console.log(`%c${tag}%c +${entry.t}ms ${msg}`, 'color:#7c3aed;font-weight:bold', 'color:inherit')
  }
}

export const callDebug = {
  init() {
    if (!isDev) return
    state.reset()
    push('[call]', 'debug session started')
  },

  // ── Signaling ────────────────────────────────────────────────────────────
  sigSend(type: string, data?: unknown) {
    if (!isDev) return
    state.sigMessagesOut++
    push('[sig]', `→ SEND ${type}`, data)
  },
  sigRecv(type: string, from?: string | null, data?: unknown) {
    if (!isDev) return
    state.sigMessagesIn++
    push('[sig]', `← RECV ${type}${from ? ` from:${from}` : ''}`, data)
  },
  sigStateChange(newState: string, attempt: number) {
    if (!isDev) return
    push('[sig]', `conn state → ${newState} (attempt ${attempt})`)
  },

  // ── Call lifecycle ────────────────────────────────────────────────────────
  callJoinSent(roomId: string) {
    if (!isDev) return
    push('[call]', `join sent room:${roomId}`)
  },
  callJoinAcked(peerCount: number) {
    if (!isDev) return
    push('[call]', `joined ack — ${peerCount} existing peer(s)`)
  },
  callIceFetched(servers: unknown[]) {
    if (!isDev) return
    push('[call]', `ICE servers fetched (${servers.length})`, servers)
  },
  callIceFailed(err: unknown) {
    if (!isDev) return
    push('[call]', 'ICE server fetch FAILED — proceeding without TURN', err)
  },
  callSfuSessionReady(peerId: string, session?: any) {
    if (!isDev) return
    if (session) state.sfuSession = session
    push('[call]', `SfuSession created peerId:${peerId}`)
  },
  callPublishStart(trackKinds: string[]) {
    if (!isDev) return
    push('[call]', `publish() → tracks:[${trackKinds.join(',')}]`)
  },
  callPublishError(err: unknown) {
    if (!isDev) return
    push('[call]', 'publish() FAILED', err)
  },
  callSfuTracksRecv(from: string, sessionId: string, tracks: string[]) {
    if (!isDev) return
    push('[call]', `sfu-tracks from:${from} session:${sessionId} tracks:[${tracks.join(',')}]`)
  },
  callSfuTracksBuffered(sessionId: string, tracks: string[]) {
    if (!isDev) return
    push('[call]', `sfu-tracks BUFFERED (session not ready) session:${sessionId} tracks:[${tracks.join(',')}]`)
  },
  callRemoteTrack(remotePeerId: string, kind: string, ttfmMs?: number) {
    if (!isDev) return
    const ttfm = ttfmMs !== undefined ? ` TTFM:${Math.round(ttfmMs)}ms` : ''
    push('[call]', `remote track ← peer:${remotePeerId} kind:${kind}${ttfm}`)
  },
  callTtfmTimeout(reason: string, ctx: unknown) {
    if (!isDev) return
    push('[call]', `⚠ TTFM TIMEOUT failure_reason:${reason}`, ctx)
  },
  callSfuAnnounce(sessionId: string, trackNames: string[], context: 'change' | 'reconnect') {
    if (!isDev) return
    push('[call]', `sfu-announce → (${context}) session:${sessionId} tracks:[${trackNames.join(',')}]`)
  },

  // ── SFU session ───────────────────────────────────────────────────────────
  sfuPushStart(kind: string) {
    if (!isDev) return
    state.sfuPublishSessions.push(kind)
    push('[sfu]', `push() started kind:${kind}`)
  },
  sfuPushReplace(kind: string) {
    if (!isDev) return
    push('[sfu]', `push() replaceTrack kind:${kind}`)
  },
  sfuPushAcked(kind: string, sessionId: string, trackName: string) {
    if (!isDev) return
    push('[sfu]', `push ACKED ✓ kind:${kind} session:${sessionId} track:${trackName}`)
  },
  sfuPushTimeout(kind: string) {
    if (!isDev) return
    push('[sfu]', `push TIMEOUT ⚠ (no CF ack, partytracks still retrying) kind:${kind}`)
  },
  sfuPushError(kind: string, err: unknown) {
    if (!isDev) return
    push('[sfu]', `push() ERROR kind:${kind}`, err)
  },
  sfuSubscribeStart(sessionId: string, trackName: string) {
    if (!isDev) return
    state.sfuSubscribeSessions.push(`${sessionId}/${trackName}`)
    state.pullTimers.push(`${sessionId}/${trackName}`)
    push('[sfu]', `pull() started session:${sessionId} track:${trackName}`)
  },
  sfuSubscribeSkipped(sessionId: string, trackName: string) {
    if (!isDev) return
    push('[sfu]', `pull() SKIPPED (already subscribed) session:${sessionId} track:${trackName}`)
  },
  sfuTrackArrived(sessionId: string, trackName: string, kind: string) {
    if (!isDev) return
    state.pullTimers = state.pullTimers.filter((k) => k !== `${sessionId}/${trackName}`)
    state.remoteTracks.push({ sessionId, trackName, kind })
    push('[sfu]', `track ARRIVED ✓ session:${sessionId} track:${trackName} kind:${kind}`)
  },
  sfuPullError(sessionId: string, trackName: string, err: unknown) {
    if (!isDev) return
    state.pullTimers = state.pullTimers.filter((k) => k !== `${sessionId}/${trackName}`)
    push('[sfu]', `pull() ERROR session:${sessionId} track:${trackName}`, err)
  },
  sfuPullTimeout(sessionId: string, trackName: string) {
    if (!isDev) return
    state.pullTimers = state.pullTimers.filter((k) => k !== `${sessionId}/${trackName}`)
    push('[sfu]', `pull() TIMEOUT ⚠ (dead track) session:${sessionId} track:${trackName}`)
  },
  sfuConnState(direction: 'pub' | string, newState: RTCPeerConnectionState) {
    if (!isDev) return
    state.connStates[direction] = newState
    push('[sfu]', `PC[${direction}] state → ${newState}`)
  },
  sfuUnsubscribePeer(sessionId: string) {
    if (!isDev) return
    push('[sfu]', `unsubscribePeer session:${sessionId}`)
  },
  statsAvSkew(sessionId: string | undefined, skewMs: number) {
    if (!isDev) return
    push('[stats]', `A/V skew ${skewMs > 0 ? 'audio behind' : 'video behind'} ${Math.abs(Math.round(skewMs))}ms session:${sessionId ?? 'pub'}`)
  },
  sfuUnsubscribeTrack(sessionId: string, trackName: string) {
    if (!isDev) return
    push('[sfu]', `unsubscribeTrack session:${sessionId} track:${trackName}`)
  },
  sfuPcFailed(direction: string) {
    if (!isDev) return
    push('[sfu]', `PC[${direction}] FAILED ⚠ — rebuilding`)
  },
  sfuClose() {
    if (!isDev) return
    push('[sfu]', 'SfuSession.close()')
  },

  // ── Reconciler ────────────────────────────────────────────────────────────
  reconcileSubscribe(peerId: string, sessionId: string, trackNames: string[]) {
    if (!isDev) return
    push('[rec]', `subscribe peer:${peerId} session:${sessionId} tracks:[${trackNames.join(',')}]`)
  },
  reconcileDrop(peerId: string, sessionId: string, reason: string) {
    if (!isDev) return
    push('[rec]', `drop peer:${peerId} session:${sessionId} reason:${reason}`)
  },
  reconcileStale(kind: string, version: number, applied: number) {
    if (!isDev) return
    push('[rec]', `IGNORED stale ${kind} v${version} (applied v${applied})`)
  },
  reconcileSnapshot(version: number, peerCount: number, trackCount: number) {
    if (!isDev) return
    push('[rec]', `room-snapshot v${version} peers:${peerCount} publishing:${trackCount}`)
  },

  // ── Repair ladder ─────────────────────────────────────────────────────────
  sfuRepair(stage: string, rung: number, attempt: number, target: string) {
    if (!isDev) return
    push('[sfu]', `REPAIR rung:${rung} attempt:${attempt} ${stage}/${target}`)
  },
  sfuRepaired(stage: string, attempts: number, target: string) {
    if (!isDev) return
    push('[sfu]', `repaired ✓ ${stage}/${target} after ${attempts} attempt(s)`)
  },
  sfuPubReset() {
    if (!isDev) return
    state.sfuPublishSessions = []
    push('[sfu]', 'publish PartyTracks REBUILT (repair rung 2)')
  },
  sfuSubscribeRetryOnAnnounce(sessionId: string, trackName: string) {
    if (!isDev) return
    push('[sfu]', `pull RETRY on re-announce (was broken) session:${sessionId} track:${trackName}`)
  },
  sfuSubReset(sessionId: string, trackNames: string[]) {
    if (!isDev) return
    push('[sfu]', `subscribe PartyTracks REBUILT (repair rung 2) session:${sessionId} tracks:${trackNames.join(',')}`)
  },

  // ── Media flow (getStats poller) ──────────────────────────────────────────
  statsFlowStalled(direction: string, kind: string, stalledForMs: number, sessionId?: string) {
    if (!isDev) return
    push('[stats]', `flow STALLED ⚠ ${direction}/${kind} silent:${Math.round(stalledForMs)}ms${sessionId ? ` session:${sessionId}` : ''}`)
  },
  statsFlowRecovered(direction: string, kind: string, sessionId?: string) {
    if (!isDev) return
    push('[stats]', `flow recovered ✓ ${direction}/${kind}${sessionId ? ` session:${sessionId}` : ''}`)
  },
}
