import { useEffect, useRef } from 'react'
import * as Sentry from '@sentry/nextjs'
import type { SignalingClient } from '@/src/services/signaling/client'
import { usePeerStore, type PeerStats } from '@/src/stores/peer'
import { fetchIceServers } from '@/src/services/api/ice'
import type {
  CallAttemptResult,
  CallFailureReason,
  ClientMetricData,
  Envelope, ErrorData, JoinedData, KnockGrantedData, PeerJoinedData, PeerLeftData, PeerStateData, SfuTracksData,
  RoomSnapshotData, StatsReportPeer,
} from '@/src/services/signaling/protocol'
import { SfuSession } from '@/src/services/webrtc/sfu-session'
import { CallReconciler } from '@/src/services/webrtc/call-reconciler'
import {
  gradeNetworkPressure,
  gradeQuality,
  startStatsMonitor,
  type StatsMonitor,
} from '@/src/services/webrtc/stats-monitor'
import { startSessionKeepalive } from '@/src/services/api/session-keepalive'
import { playPeerJoined, playPeerLeft, playScreenShareStart, playScreenShareStop } from '@/src/lib/sounds'
import { getAccessToken, getRoomToken, setRoomToken } from '@/src/services/api/token'
import { useMeetStore } from '@/src/stores/meet'
import { callDebug } from '@/src/lib/call-debug'

// The SLO ceiling from CLAUDE.md, and nothing more. Crossing it changes no
// behaviour: it records that this setup was slow and names which link was
// stuck, then the call carries on trying.
//
// It used to end the attempt — media arriving at 11s was filed as a timeout
// even though the user was in a working call. That made the success-rate SLO
// disagree with what people actually experienced, and it meant the number we
// watched got worse when a call was rescued rather than better. Now the two
// questions are separate: did it connect (success rate) and how long did it
// take (the TTFM histogram).
const TTFM_SLO_CEILING_MS = 10_000

// The tile quality dot updates on every stats poll (2s); the server only needs
// a coarse view of each call, so the stats-report message goes out every fifth
// poll. At 2s polls that is one small write per participant every 10s, which
// keeps a modest box out of a per-2s write loop per participant.
const STATS_REPORT_EVERY_N_POLLS = 5

interface Args {
  client: SignalingClient | null
  roomId: string
  enabled: boolean
  userName: string
  initialAudio: boolean
  initialVideo: boolean
}

export function useCall({ client, roomId, enabled, userName, initialAudio, initialVideo }: Args) {
  const joinArgs = useRef({ userName, initialAudio, initialVideo })

  useEffect(() => {
    joinArgs.current = { userName, initialAudio, initialVideo }
  }, [userName, initialAudio, initialVideo])

  useEffect(() => {
    if (!client || !roomId || !enabled) return

    callDebug.init()
    const store = usePeerStore
    let disposed = false

    // Keep the access token fresh for the whole call. The SFU layer
    // (partytracks) reads SfuSession's live auth header per request but has
    // no 401→refresh path of its own — with a 15-minute access TTL, any call
    // longer than that would otherwise start failing SFU requests silently.
    // Guests (room token only) are a no-op here.
    const stopKeepalive = startSessionKeepalive({
      onSessionDead: () => {
        if (disposed) return
        // The call itself keeps working (media and signaling don't need the
        // token) — but new SFU operations (a joiner's tracks, camera re-
        // publish after failure) would 401. Tell the user while the call is
        // still fine, with a one-click path back.
        Sentry.captureMessage('session expired mid-call', {
          level: 'warning',
          tags: { stage: 'session_keepalive' },
        })
        import('sonner').then(({ toast }) => {
          toast.error('Your session expired. Sign in again to keep everything working.', {
            duration: Infinity,
            action: {
              label: 'Sign in',
              onClick: () => {
                window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`
              },
            },
          })
        })
      },
    })
    const prevScreenSharing = new Map<string, boolean>()

    // Owns which remote tracks we should be pulling and which we actually are,
    // plus the CF sessionId ↔ peerId mapping that used to live in two maps
    // here. Announcements that arrive before the SFU session exists no longer
    // need buffering: they are recorded as desired state and picked up by the
    // reconcile() that runs once the session is created.
    const reconciler = new CallReconciler({
      getSession: () => store.getState().sfuSession,
    })

    // ── Time-to-first-media instrumentation ────────────────────────────────
    // joinSentAt is captured when the TTFM window opens (see armTtfmTimeout).
    // ttfmRecorded latches so we emit exactly one observation per call.
    // The timer is re-armed in three situations:
    //   1. Initial join (below in the async IIFE)
    //   2. After knock-granted — lobby wait time is not a SFU quality signal
    //   3. First peer-joined when we were previously alone — restarts the
    //      window from the moment a remote track is actually expected
    let joinSentAt = 0
    let ttfmRecorded = false
    let ttfmTimeout: ReturnType<typeof setTimeout> | null = null
    // Set when the SLO ceiling passes with no media. Media arriving afterwards
    // is still a working call, just a slow one.
    let ceilingPassed = false

    // ── Receive-chain diagnostics ──────────────────────────────────────────
    // A "call setup timeout" is opaque on its own — it just says "no media in
    // 10s". These counters let the timeout capture name WHICH link of the
    // host-publishes → sfu-tracks → subscribe → remote-track chain broke, so we
    // can act on it instead of guessing. Latched per call, never reset.
    let sfuTracksReceived = 0          // sfu-tracks messages seen (host announced media)
    const announcedSessions = new Set<string>()   // distinct remote CF sessions announced
    const tracksArrivedFor = new Set<string>()     // remote sessions that produced ≥1 track
    let pullErrors = 0                 // pulls that errored (SDP/ICE/CF 4xx)
    let pullTimeouts = 0               // pulls that never produced a track (dead-track)

    // getStats poller. Started once the SFU session exists, stopped on unmount.
    let statsMonitor: StatsMonitor | null = null

    const armTtfmTimeout = () => {
      if (ttfmTimeout) { clearTimeout(ttfmTimeout); ttfmTimeout = null }
      joinSentAt = performance.now()
      ttfmTimeout = setTimeout(() => {
        ttfmTimeout = null
        if (ttfmRecorded) return
        // If no remote peers are present the user is still alone — no media is
        // expected yet. Skip so solo joins don't pollute the counters;
        // handlePeerJoined re-arms when the first peer arrives.
        if (store.getState().peerConnections.size === 0) return
        // Deliberately NOT latching ttfmRecorded: the outcome is decided when
        // media arrives or the call ends, not here.
        ceilingPassed = true

        const peers = [...store.getState().peerConnections.values()]
        const publishingPeers = peers.filter((p) => p.audio || p.video)
        let failureReason: CallFailureReason
        if (publishingPeers.length === 0) {
          // Peers are here but none advertise audio/video — there is no media to
          // receive. Likely a benign "everyone muted" room, not a delivery bug.
          failureReason = 'peers_present_none_publishing'
        } else if (sfuTracksReceived === 0) {
          // A peer is publishing per their state, yet we never got an sfu-tracks
          // broadcast for them — points at the server broadcast/replay path
          // (hub.BroadcastSfuTracks), not the SFU pull.
          failureReason = 'no_tracks_announced'
        } else if (pullErrors > 0 && tracksArrivedFor.size === 0) {
          failureReason = 'pull_errored'
        } else if (pullTimeouts > 0 && tracksArrivedFor.size === 0) {
          // Tracks were announced and pulled, but CF never forwarded media.
          // This is the host-enabled-camera-guest-saw-nothing case.
          failureReason = 'tracks_announced_not_pulled'
        } else {
          failureReason = 'unknown'
        }

        // Errors-by-type, emitted once per call that crosses the ceiling. It
        // says which link was stuck AT THIS MOMENT, which is the only moment
        // the answer is accurate — by the time the call resolves the state has
        // usually moved. It counts slow setups as well as failed ones, and
        // that is the point: a link that stalls for 12s and then recovers is
        // the same defect as one that never recovers.
        emitMetric({ name: 'call_setup_failure', value: 0, reason: failureReason })
        callDebug.callTtfmTimeout(failureReason, {
          peers: peers.length,
          publishingPeers: publishingPeers.length,
          sfuTracksReceived,
          announcedSessions: announcedSessions.size,
          tracksArrivedFor: tracksArrivedFor.size,
          pullErrors,
          pullTimeouts,
        })
        Sentry.captureMessage('call setup slow', {
          level: 'warning',
          tags: { ttfm_outcome: 'ceiling_passed', failure_reason: failureReason },
          contexts: {
            sfu_setup: {
              failure_reason: failureReason,
              peers: peers.length,
              publishing_peers: publishingPeers.length,
              peer_media: peers.map((p) => `${p.audio ? 'a' : ''}${p.video ? 'v' : ''}` || 'none').join(','),
              sfu_tracks_received: sfuTracksReceived,
              announced_sessions: announcedSessions.size,
              tracks_arrived_for: tracksArrivedFor.size,
              pull_errors: pullErrors,
              pull_timeouts: pullTimeouts,
              has_sfu_session: !!store.getState().sfuSession,
            },
          },
        })
      }, TTFM_SLO_CEILING_MS)
    }

    // localStream never holds the screen track, so publishing it alone drops an
    // active share.
    const republishLocalMedia = async (session: SfuSession) => {
      const { localStream, screenTrack } = store.getState()
      if (localStream) await session.publish(localStream)
      if (screenTrack) await session.replaceTrack('video', screenTrack)
    }

    const emitMetric = (data: ClientMetricData) => {
      if (!client) return
      // Silently swallow if the WS is gone — observability traffic should
      // never crash a call. The server retries by aggregation, not per-event.
      try {
        client.send('client-metric', data)
      } catch {}
    }

    const recordCallAttempt = (result: CallAttemptResult) => {
      // call_attempt is the denominator for the connection-success-rate SLO, so
      // exactly one outcome per call lifecycle. The success path emits inline
      // in onRemoteTrack (it needs the TTFM value in the same place), which is
      // why this is a plain single-shot guard: it used to carve out an
      // exception for 'success' so a late arrival could overwrite the verdict
      // the ceiling had already recorded. The ceiling no longer records one,
      // so that exception is gone and with it the chance of a double emit.
      if (ttfmRecorded) return
      ttfmRecorded = true
      if (ttfmTimeout) {
        clearTimeout(ttfmTimeout)
        ttfmTimeout = null
      }
      emitMetric({ name: 'call_attempt', value: 0, result })
    }

    // Resolves when the server sends `joined` after our `join`. We must not call
    // sfuSession.publish() before the server has added us to the room — otherwise
    // hub.BroadcastSfuTracks finds room == nil and silently skips storeSfuTracks,
    // so late joiners never get our tracks replayed. See
    // vartalaap-server/internal/signaling/hub.go:136 (BroadcastSfuTracks).
    let resolveJoinedAck: (() => void) | null = null
    let joinedAck = new Promise<void>((resolve) => { resolveJoinedAck = resolve })
    const resetJoinedAck = () => {
      joinedAck = new Promise<void>((resolve) => { resolveJoinedAck = resolve })
    }

    // ── Knock/admit — guest SFU auth ─────────────────────────────────────
    // When a guest has no access token (no ?gt= exchange succeeded), they
    // knock via signaling. The host admits them, the server issues a room-
    // scoped JWT, and this promise resolves so SFU setup can continue.
    let resolveKnockGranted: ((token: string) => void) | null = null
    const knockGrantedPromise = new Promise<string>((resolve) => {
      resolveKnockGranted = resolve
    })

    const handleKnockGranted = (env: Envelope<KnockGrantedData>) => {
      const token = env.data?.sfuToken
      if (!token) return
      setRoomToken(token)
      resolveKnockGranted?.(token)
      // setIsKnocking(false) is intentionally deferred to after setSfuSession
      // below. Clearing the overlay here would unlock the UI before the SFU
      // session is ready; any camera/mic action in that window calls
      // sfuSession?.replaceTrack which silently no-ops (sfuSession is still
      // null). Deferring until after setSfuSession closes that window.
    }

    // ── Handlers ────────────────────────────────────────────────────────────

    const handleJoined = (env: Envelope<JoinedData>) => {
      const myId = client.getPeerId()
      const peers = env.data?.peers ?? []
      callDebug.callJoinAcked(peers.filter((p) => p.id !== myId).length)
      for (const p of peers) {
        if (p.id === myId) continue
        store.getState().addPeerConnection(p.id, {
          name: p.name, audio: p.audio, video: p.video,
          screenSharing: p.screenSharing ?? false, videoHeld: p.videoHeld ?? false,
        })
      }
      resolveJoinedAck?.()
    }

    const handlePeerJoined = (env: Envelope<PeerJoinedData>) => {
      const d = env.data
      if (!d?.peerId) return
      if (d.peerId === client.getPeerId()) return
      store.getState().addPeerConnection(d.peerId, {
        name: d.name, audio: d.audio, video: d.video,
        screenSharing: d.screenSharing ?? false, videoHeld: d.videoHeld ?? false,
      })
      playPeerJoined()
      // If we were alone and the TTFM timer already expired without emitting
      // (peerConnections was empty at that point), re-arm it now that there is
      // a peer who should be sending media shortly.
      if (!ttfmRecorded && !ttfmTimeout) {
        armTtfmTimeout()
      }
    }

    const handlePeerLeft = (env: Envelope<PeerLeftData>) => {
      const remoteId = env.data?.peerId
      if (!remoteId) return
      prevScreenSharing.delete(remoteId)
      // Dropping the peer from desired state makes the next reconcile release
      // their subscribe PC, which closes the CF session and stops its billing.
      // Must happen before removePeerConnection so the sfuSession is still live.
      reconciler.removePeer(remoteId)
      reconciler.reconcile()
      store.getState().removePeerConnection(remoteId)
      playPeerLeft()
    }

    const handlePeerState = (env: Envelope<PeerStateData>) => {
      if (!env.from || !env.data) return
      const newScreenSharing = env.data.screenSharing ?? false
      const oldScreenSharing = prevScreenSharing.get(env.from) ?? false
      if (newScreenSharing && !oldScreenSharing) playScreenShareStart()
      else if (!newScreenSharing && oldScreenSharing) playScreenShareStop()
      prevScreenSharing.set(env.from, newScreenSharing)
      store.getState().updatePeerMediaState(
        env.from,
        env.data.audio,
        env.data.video,
        env.data.speaking ?? false,
        newScreenSharing,
        env.data.videoHeld,
      )
    }

    const handleSfuTracks = (env: Envelope<SfuTracksData>) => {
      if (!env.from || !env.data) return
      const trackNames = env.data.tracks.map((t) => t.trackName)
      sfuTracksReceived++
      announcedSessions.add(env.data.sessionId)
      callDebug.callSfuTracksRecv(env.from, env.data.sessionId, trackNames)
      Sentry.addBreadcrumb({
        category: 'sfu',
        message: 'sfu-tracks received',
        level: 'info',
        data: { from: env.from, sessionId: env.data.sessionId, tracks: trackNames.join(','), buffered: !store.getState().sfuSession },
      })
      // Recorded as desired state rather than acted on directly. If the SFU
      // session does not exist yet the reconcile below is a no-op and the
      // reconcile after session creation picks it up.
      if (reconciler.setPeerTracks(env.from, env.data.sessionId, trackNames, env.data.version)) {
        reconciler.reconcile()
      }
    }

    // The room's full state, pushed every 15s and on request. This is the
    // level-triggered half of the protocol: it heals a missed sfu-tracks
    // without the client ever having to notice it missed one.
    const handleRoomSnapshot = (env: Envelope<RoomSnapshotData>) => {
      const d = env.data
      if (!d) return
      const myId = client.getPeerId()

      // The roster was edge-driven only, so a peer-joined or peer-left lost to
      // a reconnect was never corrected. The snapshot carries presence; use it.
      const present = new Set<string>()
      for (const p of d.peers) {
        if (p.id === myId) continue
        present.add(p.id)
        store.getState().addPeerConnection(p.id, {
          name: p.name, audio: p.audio, video: p.video,
          screenSharing: p.screenSharing ?? false, videoHeld: p.videoHeld ?? false,
        })
      }
      for (const id of store.getState().peerConnections.keys()) {
        if (present.has(id)) continue
        prevScreenSharing.delete(id)
        reconciler.removePeer(id)
        store.getState().removePeerConnection(id)
      }

      const entries = d.tracks
        .filter((t) => t.peerId !== myId)
        .map((t) => ({
          peerId: t.peerId,
          sessionId: t.sessionId,
          trackNames: t.tracks.map((x) => x.trackName),
        }))
      callDebug.reconcileSnapshot(d.version, d.peers.length, entries.length)
      if (reconciler.applySnapshot(entries, d.version)) {
        reconciler.reconcile()
      }
    }

    const handleError = (env: Envelope<ErrorData>) => {
      const code = env.data?.code
      if (code?.startsWith('ROOM_')) {
        recordCallAttempt('error')
        import('sonner').then(({ toast }) => {
          toast.error(env.data?.message || 'This meeting is not available right now.')
        })
      }
    }

    client.setReconnectedHandler(() => {
      if (disposed) return
      // What the room wants is suspect; the SFU session is not. It used to be
      // torn down here (the old clearPeers closed and nulled it) and nothing recreates
      // it — SfuSession is constructed once, in the IIFE below, keyed on
      // [client, roomId, enabled], none of which change on a reconnect. So a
      // single WebSocket blip left the rest of the call unable to publish or
      // subscribe: peers listed in the roster, no media either way, and every
      // later camera or screen-share toggle a silent no-op.
      reconciler.resetDesired()
      resetJoinedAck()
      const a = joinArgs.current
      client.send('join', {
        name: a.userName,
        audio: a.initialAudio,
        video: a.initialVideo,
        presenceId: client.getPresenceId(),
        needsAdmit: !getAccessToken() && !getRoomToken(),
      }, { room: roomId })
      // Wait for the server to re-add us to the room before re-publishing.
      // Same race as the initial join: publish before join → tracks not stored.
      void (async () => {
        await joinedAck
        if (disposed) return
        const sfuSession = store.getState().sfuSession
        if (sfuSession) {
          republishLocalMedia(sfuSession).catch((e) => {
            console.error('[use-call] sfu re-publish failed after reconnect', e)
          })
        }
        // Re-announce our published tracks. The server wiped its stored set
        // when the old connection dropped (leaveAll → removeSfuTracks), and
        // the publish() above is a no-op at the HTTP level for tracks that
        // are already pushed — so without this, peers who join after our
        // reconnect would never receive our media (failure_reason
        // no_tracks_announced), and peers who saw our peer-left would never
        // re-subscribe.
        const announcement = sfuSession?.getLocalTracksAnnouncement()
        if (announcement) {
          callDebug.callSfuAnnounce(announcement.sessionId, announcement.tracks.map((t) => t.trackName), 'reconnect')
          client.send('sfu-announce', announcement)
        }
        // Rebuild our view of the room now rather than waiting up to 15s for
        // the next pushed snapshot. reconciler.clear() emptied it, so until
        // this lands we believe nobody is publishing anything.
        client.send('sync', undefined)
      })()
    })

    client.on('joined', handleJoined as (env: Envelope) => void)
    client.on('peer-joined', handlePeerJoined as (env: Envelope) => void)
    client.on('peer-left', handlePeerLeft as (env: Envelope) => void)
    client.on('peer-state', handlePeerState as (env: Envelope) => void)
    client.on('sfu-tracks', handleSfuTracks as (env: Envelope) => void)
    client.on('room-snapshot', handleRoomSnapshot as (env: Envelope) => void)
    client.on('error', handleError as (env: Envelope) => void)
    client.on('knock-granted', handleKnockGranted as (env: Envelope) => void)

    ;(async () => {
      try {
        // Join the signaling room and WAIT for the server's ack before any SFU
        // work. Publishing before the server's hub.join has run would race with
        // hub.BroadcastSfuTracks, which silently drops the storeSfuTracks call
        // when the room doesn't exist yet — meaning late joiners never receive
        // our tracks during their join replay.
        const a = joinArgs.current
        // Open the TTFM window from the moment the join envelope leaves the
        // client. The timer is smart: if the room turns out to be empty it
        // skips the emit and re-arms when the first peer joins instead.
        armTtfmTimeout()

        callDebug.callJoinSent(roomId)
        client.send('join', {
          name: a.userName,
          audio: a.initialAudio,
          video: a.initialVideo,
          presenceId: client.getPresenceId(),
          needsAdmit: !getAccessToken() && !getRoomToken(),
        }, { room: roomId })

        await joinedAck
        if (disposed) return

        // If no token is present (guest via knock/admit, not email link),
        // announce knock and wait for the host to admit. The handleKnockGranted
        // handler stores the room token and resolves knockGrantedPromise.
        const willKnock = !getAccessToken() && !getRoomToken()
        if (willKnock) {
          useMeetStore.getState().setIsKnocking(true)
          client.send('knock', undefined)
          await knockGrantedPromise
          if (disposed) return
          // Re-arm TTFM from the moment we're admitted. The lobby wait time
          // is not a SFU quality signal — 10 s in a waiting room should not
          // count as a failed call setup.
          armTtfmTimeout()
        }

        // Fetch ICE/TURN credentials only after the server accepts the room
        // join. The backend gates Cloudflare TURN to rooms that are active
        // now, so pre-join fetching would be denied for instant meetings.
        if (store.getState().iceServers.length === 0) {
          // One retry with jitter before giving up — a transient API blip
          // shouldn't cost TURN for the whole call. Proceeding without TURN
          // is silent degradation for users on restrictive networks (their
          // pub AND sub PCs can fail ICE entirely), so the failure is
          // surfaced, not just logged.
          let iceServers: Awaited<ReturnType<typeof fetchIceServers>> | null = null
          let iceError: unknown = null
          for (let attempt = 0; attempt < 2 && !iceServers; attempt++) {
            if (attempt > 0) await new Promise((r) => setTimeout(r, 1000 + Math.random() * 500))
            if (disposed) return
            try {
              iceServers = await fetchIceServers(roomId)
            } catch (e) {
              iceError = e
            }
          }
          if (disposed) return
          if (iceServers) {
            callDebug.callIceFetched(iceServers)
            store.getState().setIceServers(iceServers)
          } else {
            callDebug.callIceFailed(iceError)
            console.warn('ICE server fetch failed, proceeding without TURN', iceError)
            Sentry.captureMessage('ice fetch failed', {
              level: 'warning',
              tags: { stage: 'ice_fetch' },
            })
            import('sonner').then(({ toast }) => {
              toast.warning('Could not reach the connection relay. The call may not work on restrictive networks.')
            })
          }
        }

        const iceServers = store.getState().iceServers as RTCIceServer[]
        const peerId = client.getPeerId()
        if (!peerId) {
          console.error('[use-call] peerId not set yet — welcome message not received')
          recordCallAttempt('error')
          return
        }
        // Tag every Sentry event that fires during this call lifecycle. Lets
        // us pivot from a Sentry alert to the specific room/peer without
        // grepping logs. Cleared on unmount below.
        Sentry.setTag('roomId', roomId)
        Sentry.setTag('peerId', peerId)
        // Per-peer remote stream accumulator so audio+video tracks for the
        // same peer surface as one MediaStream to the UI.
        const remoteStreams = new Map<string, MediaStream>()
        const sfuSession = new SfuSession({
          roomId,
          peerId,
          iceServers,
          // Server intercepts /sfu/sessions/{id}/tracks/new and broadcasts
          // sfu-tracks via hub.BroadcastSfuTracks (sfu_handler.go), so we
          // don't announce from the client.
          onRemoteTrack: (track, remoteSessionId) => {
            tracksArrivedFor.add(remoteSessionId)
            if (!ttfmRecorded && joinSentAt > 0) {
              const ttfmSeconds = (performance.now() - joinSentAt) / 1000
              ttfmRecorded = true
              if (ttfmTimeout) {
                clearTimeout(ttfmTimeout)
                ttfmTimeout = null
              }
              // Always observed, including past the ceiling — a 14s connect is
              // exactly the data point the latency SLO needs, and dropping it
              // would make the histogram flatter than reality.
              emitMetric({ name: 'time_to_first_media', value: ttfmSeconds })
              emitMetric({
                name: 'call_attempt', value: 0,
                result: ceilingPassed ? 'slow' : 'success',
              })
              // Sentry breadcrumb so a later error in the same call carries the
              // TTFM context — useful when investigating "call worked then froze".
              Sentry.addBreadcrumb({
                category: 'call',
                message: 'first remote frame',
                level: 'info',
                data: { ttfm_seconds: Number(ttfmSeconds.toFixed(2)) },
              })
            }
            const remotePeerId = reconciler.peerForSession(remoteSessionId)
            const ttfmMsForLog = !ttfmRecorded && joinSentAt > 0 ? performance.now() - joinSentAt : undefined
            callDebug.callRemoteTrack(remotePeerId ?? '??', track.kind, ttfmMsForLog)
            if (!remotePeerId) {
              console.warn('[use-call] onRemoteTrack: no peer for remoteSessionId', remoteSessionId)
              return
            }
            // Build a NEW MediaStream containing the existing tracks of other
            // kinds plus the incoming track. Mutating the prior MediaStream via
            // stream.addTrack/removeTrack does NOT fire the `addtrack` /
            // `removetrack` events — per the MediaStream spec, those only fire
            // for tracks added by the WebRTC stack, not by JS calls. The
            // VideoStream component (src/components/ui/Video.tsx) listens to
            // those events to re-sync srcObject; without them, a track arriving
            // after a peer's tile mounted (e.g. remote camera enabled mid-call)
            // is invisible to the <video> element and the user sees a frozen/
            // black frame. Allocating a new MediaStream changes the prop
            // reference, so Zustand re-renders the tile, the useEffect dep
            // changes, and sync() reassigns srcObject with the new tracks.
            const prev = remoteStreams.get(remotePeerId)
            const keptTracks = prev
              ? prev.getTracks().filter((t) => t.kind !== track.kind)
              : []
            const nextStream = new MediaStream([...keptTracks, track])
            remoteStreams.set(remotePeerId, nextStream)
            store.getState().updatePeerStream(remotePeerId, nextStream)
            Sentry.addBreadcrumb({
              category: 'call',
              message: 'remote track attached',
              level: 'info',
              data: {
                peer_id: remotePeerId,
                kind: track.kind,
                kept_kinds: keptTracks.map((t) => t.kind).join(','),
              },
            })
          },
          onConnectionStateChange: (state) => {
            if (disposed) return
            if (state === 'failed') {
              console.warn('[use-call] SFU connection failed')
              Sentry.addBreadcrumb({
                category: 'sfu', message: 'connection state failed', level: 'warning',
              })
            }
          },
          // A subscribed remote track errored — it will never arrive. Surface
          // it (not just console) so the cause is attached to this call's
          // events, and so a subsequent timeout classifies as 'pull_errored'.
          onPullError: (sessionId, trackName, err) => {
            if (disposed) return
            pullErrors++
            Sentry.addBreadcrumb({
              category: 'sfu', message: 'pull errored', level: 'error',
              data: { sessionId, trackName },
            })
            Sentry.captureException(err, { tags: { stage: 'sfu_pull' }, contexts: { sfu_pull: { sessionId, trackName } } })
          },
          // Dead-track: pull issued, no error, but CF never forwarded media
          // within the window. This is the "host's camera never reached the
          // guest" failure — record it explicitly with the offending track.
          onPullTimeout: (sessionId, trackName) => {
            if (disposed) return
            pullTimeouts++
            const remotePeerId = reconciler.peerForSession(sessionId)
            Sentry.addBreadcrumb({
              category: 'sfu', message: 'pull timeout (dead track)', level: 'warning',
              data: { sessionId, trackName, peerId: remotePeerId },
            })
            Sentry.captureMessage('sfu pull timeout', {
              level: 'warning',
              tags: { stage: 'sfu_pull', failure_reason: 'dead_track' },
              contexts: { sfu_pull: { sessionId, trackName, peerId: remotePeerId ?? 'unknown' } },
            })
          },
          // CF acked our published track set (or re-acked it under a new
          // sessionId after a PC recreation). Mirror it to the signaling
          // server so its stored copy — the source of the join replay — is
          // level-triggered rather than depending on the one-shot tracks/new
          // interception.
          onLocalTracksChanged: (announcement) => {
            if (disposed) return
            callDebug.callSfuAnnounce(announcement.sessionId, announcement.tracks.map((t) => t.trackName), 'change')
            client.send('sfu-announce', announcement)
          },
          // A repair is running. Counted by rung, because "rung 1 fixed it"
          // and "everything reaches rung 2" are very different systems and
          // the counter is the only thing that tells them apart.
          onRepair: (info) => {
            if (disposed) return
            emitMetric({
              name: 'sfu_repair', value: 0,
              stage: info.stage, rung: info.rung, outcome: 'attempted',
            })
            Sentry.addBreadcrumb({
              category: 'sfu', message: 'repair attempt', level: 'warning',
              data: {
                stage: info.stage, rung: info.rung, attempt: info.attempt,
                kind: info.kind, session_id: info.sessionId, track: info.trackName,
              },
            })
          },
          // Media is flowing again. This is the event that makes the repair
          // counters readable: attempted without recovered is a ladder that
          // spins without fixing anything.
          onRepaired: (info) => {
            if (disposed) return
            emitMetric({
              name: 'sfu_repair', value: 0,
              stage: info.stage, rung: info.rung, outcome: 'recovered',
            })
            Sentry.addBreadcrumb({
              category: 'sfu', message: 'repair succeeded', level: 'info',
              data: {
                stage: info.stage, rung: info.rung, attempts: info.attempt,
                kind: info.kind, session_id: info.sessionId, track: info.trackName,
              },
            })
          },
          // A pushed track never got a CF ack. The repair ladder takes over
          // from here; this exists to tell the user their camera is not
          // reaching anyone yet.
          onPublishTimeout: (kind) => {
            if (disposed) return
            Sentry.captureMessage('sfu publish timeout', {
              level: 'warning',
              tags: { stage: 'sfu_publish', failure_reason: 'push_not_acked' },
              contexts: { sfu_push: { kind } },
            })
            import('sonner').then(({ toast }) => {
              toast.error(
                kind === 'video'
                  ? 'Your camera is not reaching others yet. Reconnecting it now.'
                  : 'Your microphone is not reaching others yet. Reconnecting it now.',
              )
            })
          },
        })
        if (disposed) {
          sfuSession.close()
          return
        }
        callDebug.callSfuSessionReady(peerId, sfuSession)
        store.getState().setSfuSession(sfuSession)

        // ── Media-flow monitoring ──────────────────────────────────────────
        // Fills the PeerStats / stats-report contract, which already had
        // consumers (the per-tile quality dot, the server's quality store)
        // but no producer: nothing in the client called getStats(), so
        // "a track arrived once" was our only definition of a working call.
        //
        // Read-only on purpose. It reports; it does not repair. Repair is the
        // next step and wants this data to aim at.
        let pollsSinceReport = 0
        statsMonitor = startStatsMonitor({
          collect: () => store.getState().sfuSession?.collectStats() ?? Promise.resolve([]),
          onPoll: (samples) => {
            if (disposed) return
            const pub = samples.find((s) => s.direction === 'publish')
            if (pub) {
              store.getState().updateLocalStats({
                outboundBitrateKbps: pub.outboundKbps,
                roundTripTimeMs: pub.roundTripTimeMs,
                candidateType: pub.candidateType,
                timestamp: Date.now(),
              })
            }
            const report: StatsReportPeer[] = []
            for (const s of samples) {
              if (s.direction !== 'subscribe' || !s.sessionId) continue
              const remotePeerId = reconciler.peerForSession(s.sessionId)
              if (!remotePeerId) continue
              // RTT and candidate type come from whichever leg measured them:
              // this peer's subscribe PC when it has a nominated pair, else
              // our uplink. Outbound bitrate is always the publish PC — under
              // the SFU there is ONE upstream shared by every remote peer, so
              // it is deliberately not a per-peer number.
              const rttMs = s.roundTripTimeMs >= 0 ? s.roundTripTimeMs : (pub?.roundTripTimeMs ?? -1)
              const candidateType = s.candidateType !== 'unknown' ? s.candidateType : (pub?.candidateType ?? 'unknown')
              const stats: PeerStats = {
                outboundBitrateKbps: pub?.outboundKbps ?? 0,
                inboundBitrateKbps: s.inboundKbps,
                packetLossPercent: s.packetLossPercent,
                roundTripTimeMs: rttMs,
                jitterMs: s.jitterMs,
                candidateType,
                quality: gradeQuality(rttMs, s.packetLossPercent),
                networkPressure: gradeNetworkPressure(rttMs, s.packetLossPercent),
                // No adaptive encoder exists yet, so nothing downgrades or
                // holds outbound video. Constants until that controller lands.
                encodingLevel: 2,
                videoHeld: false,
                timestamp: Date.now(),
                frameWidth: s.frameWidth,
                frameHeight: s.frameHeight,
                framesPerSecond: s.framesPerSecond,
              }
              store.getState().updatePeerStats(remotePeerId, stats)
              report.push({
                peerId: remotePeerId,
                quality: stats.quality,
                networkPressure: stats.networkPressure,
                roundTripTimeMs: stats.roundTripTimeMs,
                packetLossPercent: stats.packetLossPercent,
                outboundBitrateKbps: stats.outboundBitrateKbps,
                inboundBitrateKbps: stats.inboundBitrateKbps,
                candidateType: stats.candidateType,
                jitterMs: stats.jitterMs,
                encodingLevel: stats.encodingLevel,
                videoHeld: stats.videoHeld,
                frameWidth: stats.frameWidth,
                frameHeight: stats.frameHeight,
                framesPerSecond: stats.framesPerSecond,
              })
            }
            pollsSinceReport++
            if (report.length > 0 && pollsSinceReport >= STATS_REPORT_EVERY_N_POLLS) {
              pollsSinceReport = 0
              try {
                client.send('stats-report', { peers: report })
              } catch {}
            }
          },
          // A stream that was flowing stopped. For our own uplink the monitor
          // has already confirmed the sender is live and enabled, so any stall
          // it reports is real. For a remote stream it cannot know intent:
          // a peer muting produces byte counters identical to a broken pull,
          // so the peer's declared media state is what separates them.
          onStall: (stall) => {
            if (disposed) return
            const remotePeerId = stall.sessionId ? reconciler.peerForSession(stall.sessionId) : undefined
            let expected = true
            if (stall.direction === 'subscribe') {
              const peer = remotePeerId ? store.getState().peerConnections.get(remotePeerId) : undefined
              expected = stall.kind === 'audio' ? !!peer?.audio : !!peer?.video
            }
            Sentry.addBreadcrumb({
              category: 'stats',
              message: expected ? 'media flow stalled' : 'media flow stopped (peer not publishing this kind)',
              level: expected ? 'warning' : 'info',
              data: {
                direction: stall.direction,
                kind: stall.kind,
                stalled_for_ms: stall.stalledForMs,
                peer_id: remotePeerId,
              },
            })
            store.getState().recordMediaFlowEvent({
              direction: stall.direction,
              kind: stall.kind,
              outcome: 'stalled',
              durationMs: stall.stalledForMs,
              peerId: remotePeerId,
              peerName: remotePeerId ? store.getState().peerConnections.get(remotePeerId)?.name : undefined,
            })
            if (!expected) return
            Sentry.captureMessage('media flow stalled', {
              level: 'warning',
              tags: {
                stage: 'media_flow',
                failure_reason: 'flow_stalled',
                flow_direction: stall.direction,
                flow_kind: stall.kind,
              },
              contexts: {
                media_flow: {
                  direction: stall.direction,
                  kind: stall.kind,
                  ssrc: stall.ssrc,
                  stalled_for_ms: stall.stalledForMs,
                  session_id: stall.sessionId ?? 'pub',
                  peer_id: remotePeerId ?? 'self',
                },
              },
            })
          },
          // Breadcrumb only. Recovery is what separates a transient blip from
          // a dead stream, and it matters most as context on a later error in
          // the same call — not as its own alert.
          onRecover: (stall) => {
            if (disposed) return
            const remotePeerId = stall.sessionId ? reconciler.peerForSession(stall.sessionId) : undefined
            store.getState().recordMediaFlowEvent({
              direction: stall.direction,
              kind: stall.kind,
              outcome: 'recovered',
              durationMs: stall.stalledForMs,
              peerId: remotePeerId,
              peerName: remotePeerId ? store.getState().peerConnections.get(remotePeerId)?.name : undefined,
            })
            Sentry.addBreadcrumb({
              category: 'stats',
              message: 'media flow recovered',
              level: 'info',
              data: {
                direction: stall.direction,
                kind: stall.kind,
                outage_ms: stall.stalledForMs,
                peer_id: remotePeerId,
              },
            })
          },
        })
        if (willKnock) useMeetStore.getState().setIsKnocking(false)

        // Pick up anything announced while the session was being constructed.
        // Previously this drained a buffer of raw messages; now it is just a
        // reconcile against state that was already recorded.
        reconciler.reconcile()

        const localStream = store.getState().localStream
        if (localStream) {
          callDebug.callPublishStart(localStream.getTracks().map((t) => t.kind))
          await sfuSession.publish(localStream).catch((e) => {
            console.error('[use-call] sfu publish failed — no media will be sent', e)
            callDebug.callPublishError(e)
            // Publish failure means peers will never see our tracks. Even if
            // their tracks arrive (TTFM success), the call is one-sided. Record
            // as error so the success-rate SLO reflects this.
            recordCallAttempt('error')
            Sentry.captureException(e, { tags: { stage: 'sfu_publish' } })
            import('sonner').then(({ toast }) => {
              toast.error('Could not start your camera or microphone. Try leaving and rejoining.')
            })
          })
        }
      } catch (e) {
        console.error('failed to init call', e)
        recordCallAttempt('error')
        Sentry.captureException(e, { tags: { stage: 'call_init' } })
      }
    })()

    return () => {
      client.send('leave', undefined, { room: roomId })
      disposed = true
      stopKeepalive()
      statsMonitor?.stop()
      // The call ended with no media. Which of the two failure shapes it was
      // depends on whether anything was owed: a peer who was present and
      // publishing means we failed to deliver, and that is the failure the
      // success-rate SLO exists to count. Nobody publishing means there was
      // nothing to receive, which is not our fault and must not drag the SLO
      // down — a user sitting alone in a room and leaving is not a failed call.
      if (!ttfmRecorded && joinSentAt > 0) {
        const peers = [...store.getState().peerConnections.values()]
        const owed = peers.some((p) => p.audio || p.video)
        recordCallAttempt(owed ? 'failed' : 'abandoned')
      }
      if (ttfmTimeout) {
        clearTimeout(ttfmTimeout)
        ttfmTimeout = null
      }
      // Clear call-scoped Sentry tags so errors after unmount aren't mis-tagged
      // with a stale room/peer.
      Sentry.setTag('roomId', undefined)
      Sentry.setTag('peerId', undefined)
      client.setReconnectedHandler(undefined)
      client.off('joined', handleJoined as (env: Envelope) => void)
      client.off('peer-joined', handlePeerJoined as (env: Envelope) => void)
      client.off('peer-left', handlePeerLeft as (env: Envelope) => void)
      client.off('peer-state', handlePeerState as (env: Envelope) => void)
      client.off('sfu-tracks', handleSfuTracks as (env: Envelope) => void)
      client.off('room-snapshot', handleRoomSnapshot as (env: Envelope) => void)
      client.off('error', handleError as (env: Envelope) => void)
      client.off('knock-granted', handleKnockGranted as (env: Envelope) => void)
      useMeetStore.getState().setIsKnocking(false)
      // Room token is scoped to this specific call. Leaving the page (or
      // re-joining the same room) should not reuse a stale SFU JWT.
      setRoomToken(null)
      store.getState().clearAll()
    }
    // Intentionally excluding userName/initialAudio/initialVideo: they're
    // captured via joinArgs ref so mute toggles don't rejoin the room.
  }, [client, roomId, enabled])
}
