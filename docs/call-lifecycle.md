# Call lifecycle and recovery

The call is a state machine driven by signaling, SFU acknowledgements, browser
connection state, and media byte flow. Wall-clock thresholds detect degraded
states; they do not decide that an operation failed by themselves.

## Lifecycle

1. **Signaling connected** — install handlers, start session keepalive, and send
   `join` with the participant's current device intent.
2. **Room joined** — wait for a `joined` event newer than the join attempt. Do
   not create or publish an SFU session before the server has installed the
   participant in the room.
3. **Admission complete** — an unauthenticated guest sends `knock` and remains
   blocked until `knock-granted` supplies the room-scoped SFU token.
4. **Local media ready** — fetch ICE/TURN configuration, restore any intended
   camera or microphone track that is no longer live, create the SFU session,
   and publish.
5. **Publication acknowledged** — Cloudflare acknowledgement supplies the
   current session and track names. Send the complete set to signaling. The
   server stores this level-triggered state and replays it to later joiners.
6. **Remote state reconciled** — `sfu-tracks` and periodic `room-snapshot`
   messages update desired remote state. The reconciler starts missing pulls,
   removes obsolete pulls, and ignores older room versions.
7. **Active call** — browser connection state and media byte flow are observed.
   Explicit peer-connection failure enters fast repair. A connected transport
   with temporarily silent bytes enters a recovery grace period; resumed bytes
   cancel repair.
8. **Signaling reconnect** — keep the working SFU session, clear suspect desired
   room state, rejoin, wait for the new `joined` event, restore local state,
   re-announce publication, and request an immediate snapshot. Only the latest
   reconnect generation may apply these actions.
9. **Media session replacement** — withdraw the obsolete published session from
   signaling before rebuilding. Async callbacks from older publish or subscribe
   generations cannot mutate the replacement session.
10. **Call ended** — send `leave`, invalidate pending generations and waiters,
    cancel repair timers and stats collection, close SFU sessions, stop local
    tracks, and clear call-scoped state.

## Invariants

- SFU publication starts only after the room acknowledges `join`.
- Signaling stores at most one current published session per participant.
- A replacement is ordered as `old publication -> old withdrawal -> new publication`.
- A late callback from an obsolete generation cannot restore obsolete state.
- Repeated events are safe: joins, track announcements, snapshots, and pull
  requests reconcile toward current state.
- Recovery continues while the participant remains in the call. A latency
  threshold records degradation and schedules a transition; it does not end the
  call or immediately destroy a connected media session.
- Leaving the call is the cancellation boundary for all pending work.

## Failure transitions

| Signal | Transition |
| --- | --- |
| No publish/pull acknowledgement | Retry the affected operation, then rebuild that direction if it remains unresolved |
| `RTCPeerConnectionState === failed` | Start fast repair for that publish or subscribe connection |
| Bytes stop on an expected live flow | Mark degraded and arm the media recovery grace |
| Bytes resume during grace | Cancel the pending rebuild and mark recovered |
| Bytes remain stopped through grace | Withdraw/rebuild only the affected direction |
| Signaling reconnects | Rejoin and reconcile without destroying working media |
| Room snapshot contradicts local desired state | Apply the newer snapshot and reconcile subscriptions |
| Participant leaves | Cancel every timer, waiter, operation, and media session owned by the call |
