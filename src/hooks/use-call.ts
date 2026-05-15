import { useEffect, useRef } from 'react'
import type { SignalingClient } from '@/src/services/signaling/client'
import { usePeerStore } from '@/src/stores/peer'
import { fetchIceServers } from '@/src/services/api/ice'
import type {
  Envelope, JoinedData, PeerJoinedData, PeerLeftData, PeerStateData, SfuTracksData,
} from '@/src/services/signaling/protocol'
import { SfuSession } from '@/src/services/webrtc/sfu-session'
import { playPeerJoined, playPeerLeft, playScreenShareStart, playScreenShareStop } from '@/src/lib/sounds'

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
    // sfu-tracks messages that arrive before sfuSession is ready are buffered here.
    const pendingSfuTracks: Array<{ sessionId: string; trackNames: string[] }> = []

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
      // to the right participant.
      remoteSessionToPeer.set(env.data.sessionId, env.from)
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

    client.setReconnectedHandler(() => {
      if (disposed) return
      remoteSessionToPeer.clear()
      pendingSfuTracks.length = 0
      store.getState().clearPeers()
      resetJoinedAck()
      const a = joinArgs.current
      client.send('join', {
        name: a.userName,
        audio: a.initialAudio,
        video: a.initialVideo,
        presenceId: client.getPresenceId(),
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

    ;(async () => {
      try {
        // Fetch ICE servers once.
        if (store.getState().iceServers.length === 0) {
          try {
            const iceServers = await fetchIceServers()
            if (disposed) return
            store.getState().setIceServers(iceServers)
          } catch (e) {
            console.warn('ICE server fetch failed, proceeding without TURN', e)
          }
        }
        if (disposed) return

        // Join the signaling room and WAIT for the server's ack before any SFU
        // work. Publishing before the server's hub.join has run would race with
        // hub.BroadcastSfuTracks, which silently drops the storeSfuTracks call
        // when the room doesn't exist yet — meaning late joiners never receive
        // our tracks during their join replay.
        const a = joinArgs.current
        client.send('join', {
          name: a.userName,
          audio: a.initialAudio,
          video: a.initialVideo,
          presenceId: client.getPresenceId(),
        }, { room: roomId })

        await joinedAck
        if (disposed) return

        const iceServers = store.getState().iceServers as RTCIceServer[]
        const peerId = client.getPeerId()
        if (!peerId) {
          console.error('[use-call] peerId not set yet — welcome message not received')
          return
        }
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
            const remotePeerId = remoteSessionToPeer.get(remoteSessionId)
            if (!remotePeerId) {
              console.warn('[use-call] onRemoteTrack: no peer for remoteSessionId', remoteSessionId)
              return
            }
            let stream = remoteStreams.get(remotePeerId)
            if (!stream) {
              stream = new MediaStream()
              remoteStreams.set(remotePeerId, stream)
            }
            // Replace any existing track of the same kind — partytracks can
            // re-emit a fresh MediaStreamTrack if the PC is recreated.
            for (const existing of stream.getTracks()) {
              if (existing.kind === track.kind) stream.removeTrack(existing)
            }
            stream.addTrack(track)
            store.getState().updatePeerStream(remotePeerId, stream)
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
            import('sonner').then(({ toast }) => {
              toast.error('Could not start your camera or microphone. Try leaving and rejoining.')
            })
          })
        }
      } catch (e) {
        console.error('failed to init call', e)
      }
    })()

    return () => {
      client.send('leave', undefined, { room: roomId })
      disposed = true
      client.setReconnectedHandler(undefined)
      client.off('joined', handleJoined as (env: Envelope) => void)
      client.off('peer-joined', handlePeerJoined as (env: Envelope) => void)
      client.off('peer-left', handlePeerLeft as (env: Envelope) => void)
      client.off('peer-state', handlePeerState as (env: Envelope) => void)
      client.off('sfu-tracks', handleSfuTracks as (env: Envelope) => void)
      store.getState().clearAll()
    }
    // Intentionally excluding userName/initialAudio/initialVideo: they're
    // captured via joinArgs ref so mute toggles don't rejoin the room.
  }, [client, roomId, enabled])
}
