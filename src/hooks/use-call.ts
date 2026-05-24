import { useEffect, useRef } from 'react'
import * as Sentry from '@sentry/nextjs'
import type { SignalingClient } from '@/src/services/signaling/client'
import { usePeerStore } from '@/src/stores/peer'
import { fetchIceServers } from '@/src/services/api/ice'
import type {
  CallAttemptResult,
  ClientMetricData,
  Envelope, ErrorData, JoinedData, KnockGrantedData, PeerJoinedData, PeerLeftData, PeerStateData, SfuTracksData,
} from '@/src/services/signaling/protocol'
import { SfuSession } from '@/src/services/webrtc/sfu-session'
import { playPeerJoined, playPeerLeft, playScreenShareStart, playScreenShareStop } from '@/src/lib/sounds'
import { getAccessToken, getRoomToken, setRoomToken } from '@/src/services/api/token'
import { useMeetStore } from '@/src/stores/meet'

// The CLAUDE.md SLO calls anything over 10s a failed connection attempt rather
// than a slow success. If we don't see a remote frame within this window we
// emit result=timeout so the call-success-rate SLO reflects the user's view.
const TTFM_TIMEOUT_MS = 10_000

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

    const store = usePeerStore
    let disposed = false
    const prevScreenSharing = new Map<string, boolean>()
    // Maps CF remoteSessionId → signaling peerId so onRemoteTrack can route tracks.
    const remoteSessionToPeer = new Map<string, string>()
    // Reverse map: signaling peerId → CF remoteSessionId so handlePeerLeft can
    // call sfuSession.unsubscribePeer with the right CF session ID.
    const peerToRemoteSession = new Map<string, string>()
    // sfu-tracks messages that arrive before sfuSession is ready are buffered here.
    const pendingSfuTracks: Array<{ sessionId: string; trackNames: string[] }> = []

    // ── Time-to-first-media instrumentation ────────────────────────────────
    // joinSentAt is captured the moment we hand the `join` envelope to the
    // signaling client. ttfmRecorded latches so we emit exactly one observation
    // per call (a peer might publish multiple tracks; only the first matters).
    // ttfmTimeout fires at TTFM_TIMEOUT_MS and emits result=timeout so the
    // call-success-rate SLO captures users who gave up waiting.
    let joinSentAt = 0
    let ttfmRecorded = false
    let ttfmTimeout: ReturnType<typeof setTimeout> | null = null

    const emitMetric = (data: ClientMetricData) => {
      if (!client) return
      // Silently swallow if the WS is gone — observability traffic should
      // never crash a call. The server retries by aggregation, not per-event.
      try {
        client.send('client-metric', data)
      } catch {}
    }

    const recordCallAttempt = (result: CallAttemptResult) => {
      // call_attempt is the denominator for the connection-success-rate SLO.
      // Idempotent on success: ttfmRecorded guards repeats; this guard is for
      // timeout/error/abandoned races. We always emit exactly one outcome per
      // call lifecycle.
      if (ttfmRecorded && result !== 'success') return
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
      for (const p of peers) {
        if (p.id === myId) continue
        // Register peer metadata only — no per-peer RTCPeerConnection in SFU mode.
        // Tracks arrive via sfu-tracks after the remote peer publishes.
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
    }

    const handlePeerLeft = (env: Envelope<PeerLeftData>) => {
      const remoteId = env.data?.peerId
      if (!remoteId) return
      prevScreenSharing.delete(remoteId)
      // Release the per-session subscribe PC for this peer so the CF session
      // is closed and billing stops. Must happen before removePeerConnection
      // so the sfuSession reference is still valid.
      const remoteSessionId = peerToRemoteSession.get(remoteId)
      if (remoteSessionId) {
        store.getState().sfuSession?.unsubscribePeer(remoteSessionId)
        peerToRemoteSession.delete(remoteId)
        remoteSessionToPeer.delete(remoteSessionId)
      }
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
      // Record the CF sessionId → signaling peerId mapping so onRemoteTrack
      // (fired by partytracks when a pull resolves) can attribute the track
      // to the right participant. Also maintain the reverse map so we can
      // call sfuSession.unsubscribePeer when that signaling peer leaves.
      remoteSessionToPeer.set(env.data.sessionId, env.from)
      peerToRemoteSession.set(env.from, env.data.sessionId)
      const sfuSession = store.getState().sfuSession
      if (!sfuSession) {
        // partytracks instance not constructed yet — buffer until init below.
        pendingSfuTracks.push({ sessionId: env.data.sessionId, trackNames })
        return
      }
      sfuSession.subscribe(env.data.sessionId, trackNames).catch((e) => {
        console.error('[use-call] sfu subscribe failed', e)
      })
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
      remoteSessionToPeer.clear()
      peerToRemoteSession.clear()
      pendingSfuTracks.length = 0
      store.getState().clearPeers()
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
        const localStream = store.getState().localStream
        if (sfuSession && localStream) {
          sfuSession.publish(localStream).catch((e) => {
            console.error('[use-call] sfu re-publish failed after reconnect', e)
          })
        }
      })()
    })

    client.on('joined', handleJoined as (env: Envelope) => void)
    client.on('peer-joined', handlePeerJoined as (env: Envelope) => void)
    client.on('peer-left', handlePeerLeft as (env: Envelope) => void)
    client.on('peer-state', handlePeerState as (env: Envelope) => void)
    client.on('sfu-tracks', handleSfuTracks as (env: Envelope) => void)
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
        joinSentAt = performance.now()
        // The TTFM clock starts the moment the join envelope leaves the client.
        // Anything that prevents a remote frame from arriving — server-side
        // join failure, SFU 5xx, peer never publishing — should land as a
        // timeout, not silence. The timer is cancelled on success, error, or
        // unmount.
        ttfmTimeout = setTimeout(() => {
          if (ttfmRecorded) return
          ttfmRecorded = true
          emitMetric({ name: 'call_attempt', value: 0, result: 'timeout' })
          Sentry.captureMessage('call setup timeout', {
            level: 'warning',
            tags: { ttfm_outcome: 'timeout' },
          })
        }, TTFM_TIMEOUT_MS)

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
        }

        // Fetch ICE/TURN credentials only after the server accepts the room
        // join. The backend gates Cloudflare TURN to rooms that are active
        // now, so pre-join fetching would be denied for instant meetings.
        if (store.getState().iceServers.length === 0) {
          try {
            const iceServers = await fetchIceServers(roomId)
            if (disposed) return
            store.getState().setIceServers(iceServers)
          } catch (e) {
            console.warn('ICE server fetch failed, proceeding without TURN', e)
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
            // First remote track for this call = end of TTFM window. Latch so
            // additional tracks (audio after video, or a second peer's tracks)
            // don't re-emit. We measure the user-visible "I can see/hear the
            // other person" moment, not per-track timings.
            if (!ttfmRecorded && joinSentAt > 0) {
              const ttfmSeconds = (performance.now() - joinSentAt) / 1000
              ttfmRecorded = true
              if (ttfmTimeout) {
                clearTimeout(ttfmTimeout)
                ttfmTimeout = null
              }
              emitMetric({ name: 'time_to_first_media', value: ttfmSeconds })
              emitMetric({ name: 'call_attempt', value: 0, result: 'success' })
              // Sentry breadcrumb so a later error in the same call carries the
              // TTFM context — useful when investigating "call worked then froze".
              Sentry.addBreadcrumb({
                category: 'call',
                message: 'first remote frame',
                level: 'info',
                data: { ttfm_seconds: Number(ttfmSeconds.toFixed(2)) },
              })
            }
            const remotePeerId = remoteSessionToPeer.get(remoteSessionId)
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
            }
          },
        })
        if (disposed) {
          sfuSession.close()
          return
        }
        store.getState().setSfuSession(sfuSession)
        // Now safe to unlock the call UI — sfuSession is live, so camera/mic
        // toggles will publish correctly. Doing this before setSfuSession would
        // create a window where replaceTrack silently no-ops.
        if (willKnock) useMeetStore.getState().setIsKnocking(false)

        // Drain sfu-tracks that arrived while the session was being constructed.
        for (const { sessionId, trackNames } of pendingSfuTracks) {
          sfuSession.subscribe(sessionId, trackNames).catch((e) => {
            console.error('[use-call] sfu subscribe failed (buffered)', e)
          })
        }
        pendingSfuTracks.length = 0

        const localStream = store.getState().localStream
        if (localStream) {
          await sfuSession.publish(localStream).catch((e) => {
            console.error('[use-call] sfu publish failed — no media will be sent', e)
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
      // If the user navigated away before TTFM resolved, count it as abandoned —
      // not as success or timeout. Distinguishes "user gave up" from "we failed
      // to deliver" in the SLO breakdown.
      if (!ttfmRecorded && joinSentAt > 0) {
        recordCallAttempt('abandoned')
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
