import { useEffect, useRef } from 'react'
import type { SignalingClient } from '@/src/services/signaling/client'
import { usePeerStore } from '@/src/stores/peer'
import { fetchIceServers } from '@/src/services/api/ice'
import type {
  Envelope, JoinedData, PeerJoinedData, PeerLeftData, PeerStateData, SfuTracksData,
} from '@/src/services/signaling/protocol'
import type { SignalData } from '@/src/services/webrtc/session'
import { RealtimeSfuSession } from '@/src/services/webrtc/realtime-sfu-session'
import { playPeerJoined, playPeerLeft, playScreenShareStart, playScreenShareStop } from '@/src/lib/sounds'

interface Args {
  client: SignalingClient | null
  roomId: string
  enabled: boolean
  userName: string
  initialAudio: boolean
  initialVideo: boolean
  sfuEnabled?: boolean
}

export function useCall({ client, roomId, enabled, userName, initialAudio, initialVideo, sfuEnabled = false }: Args) {
  const joinArgs = useRef({ userName, initialAudio, initialVideo })

  useEffect(() => {
    joinArgs.current = { userName, initialAudio, initialVideo }
  }, [userName, initialAudio, initialVideo])

  useEffect(() => {
    if (!client || !roomId || !enabled) return

    const store = usePeerStore
    let disposed = false
    const prevScreenSharing = new Map<string, boolean>()
    // SFU only: maps CF remoteSessionId → signaling peerId so onRemoteTrack can route tracks.
    const remoteSessionToPeer = new Map<string, string>()
    // SFU only: sfu-tracks messages that arrive before sfuSession is ready are buffered here.
    const pendingSfuTracks: Array<{ sessionId: string; trackNames: string[] }> = []

    // ── P2P helpers (used when sfuEnabled=false) ────────────────────────────

    const pendingSignals = new Map<string, SignalData[]>()

    const makeSession = (
      remoteId: string,
      initiator: boolean,
      info: { name: string; audio: boolean; video: boolean; screenSharing?: boolean; videoHeld?: boolean },
    ) => {
      if (store.getState().peerConnections.has(remoteId)) {
        store.getState().removePeerConnection(remoteId)
      }

      const localStream = store.getState().localStream ?? new MediaStream()
      const session = store.getState().createSession({
        initiator,
        localStream,
        onSignal: (data) => {
          client.send('signal', data, { to: remoteId })
        },
        onRemoteStream: (stream) => {
          store.getState().updatePeerStream(remoteId, stream)
        },
        onConnectionStateChange: (state) => {
          if (disposed) return
          store.getState().updatePeerConnectionState(remoteId, state)
          if (state === 'failed') {
            console.warn('[use-call] peer connection failed', remoteId)
          }
        },
      })

      store.getState().addPeerConnection(remoteId, session, info)

      const buffered = pendingSignals.get(remoteId)
      if (buffered) {
        buffered.forEach((data) => { void session.signal(data) })
        pendingSignals.delete(remoteId)
      }

      return session
    }

    // ── Shared handlers ──────────────────────────────────────────────────────

    const handleJoined = (env: Envelope<JoinedData>) => {
      const myId = client.getPeerId()
      const peers = env.data?.peers ?? []
      for (const p of peers) {
        if (p.id === myId) continue
        if (sfuEnabled) {
          // In SFU mode: register peer metadata only — no per-peer RTCPeerConnection.
          // Tracks arrive via sfu-tracks after the remote peer publishes.
          store.getState().addPeerConnection(p.id, undefined, {
            name: p.name, audio: p.audio, video: p.video,
            screenSharing: p.screenSharing ?? false, videoHeld: p.videoHeld ?? false,
          })
        } else {
          makeSession(p.id, true, {
            name: p.name, audio: p.audio, video: p.video,
            screenSharing: p.screenSharing ?? false, videoHeld: p.videoHeld ?? false,
          })
        }
      }
    }

    const handlePeerJoined = (env: Envelope<PeerJoinedData>) => {
      const d = env.data
      if (!d?.peerId) return
      if (d.peerId === client.getPeerId()) return
      if (sfuEnabled) {
        store.getState().addPeerConnection(d.peerId, undefined, {
          name: d.name, audio: d.audio, video: d.video,
          screenSharing: d.screenSharing ?? false, videoHeld: d.videoHeld ?? false,
        })
      } else {
        makeSession(d.peerId, false, {
          name: d.name, audio: d.audio, video: d.video,
          screenSharing: d.screenSharing ?? false, videoHeld: d.videoHeld ?? false,
        })
      }
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

    // P2P only
    const handleSignal = (env: Envelope) => {
      if (!env.from) return
      const conn = store.getState().peerConnections.get(env.from)
      if (!conn) {
        const buf = pendingSignals.get(env.from) ?? []
        buf.push(env.data as SignalData)
        pendingSignals.set(env.from, buf)
        return
      }
      void conn.session?.signal(env.data as SignalData)
    }

    // SFU only
    const handleSfuTracks = (env: Envelope<SfuTracksData>) => {
      if (!env.from || !env.data) return
      const trackNames = env.data.tracks.map((t) => t.trackName)
      // Always record the mapping — needed even when session isn't ready yet.
      remoteSessionToPeer.set(env.data.sessionId, env.from)
      const sfuSession = store.getState().sfuSession
      if (!sfuSession) {
        // SFU session is still being created (HTTP roundtrip to CF). Buffer for drain below.
        pendingSfuTracks.push({ sessionId: env.data.sessionId, trackNames })
        return
      }
      sfuSession.subscribe(env.data.sessionId, trackNames).catch((e) => {
        console.error('[use-call] sfu subscribe failed', e)
      })
    }

    client.setReconnectedHandler(() => {
      if (disposed) return
      pendingSignals.clear()
      remoteSessionToPeer.clear()
      pendingSfuTracks.length = 0
      store.getState().clearPeers()
      const a = joinArgs.current
      client.send('join', {
        name: a.userName,
        audio: a.initialAudio,
        video: a.initialVideo,
        presenceId: client.getPresenceId(),
      }, { room: roomId })
      // In SFU mode: re-publish local tracks after reconnect.
      if (sfuEnabled) {
        const sfuSession = store.getState().sfuSession
        const localStream = store.getState().localStream
        if (sfuSession && localStream) {
          sfuSession.publish(localStream).catch((e) => {
            console.error('[use-call] sfu re-publish failed after reconnect', e)
          })
        }
      }
    })

    client.on('joined', handleJoined as (env: Envelope) => void)
    client.on('peer-joined', handlePeerJoined as (env: Envelope) => void)
    client.on('peer-left', handlePeerLeft as (env: Envelope) => void)
    client.on('peer-state', handlePeerState as (env: Envelope) => void)
    if (!sfuEnabled) {
      client.on('signal', handleSignal)
    } else {
      client.on('sfu-tracks', handleSfuTracks as (env: Envelope) => void)
    }

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

        // Join the signaling room first so the broadcaster is in the room when
        // sfuTracksNew fires — the server only stores/broadcasts to room members.
        const a = joinArgs.current
        client.send('join', {
          name: a.userName,
          audio: a.initialAudio,
          video: a.initialVideo,
          presenceId: client.getPresenceId(),
        }, { room: roomId })

        if (sfuEnabled) {
          // Create SFU session and publish AFTER joining so BroadcastSfuTracks
          // reaches peers already in the room and storeSfuTracks has a valid room.
          const iceServers = store.getState().iceServers as RTCIceServer[]
          const peerId = client.getPeerId()
          if (!peerId) {
            console.error('[use-call] SFU: peerId not set yet — welcome message not received')
            return
          }
          const sfuSession = await RealtimeSfuSession.create({
            roomId,
            peerId,
            iceServers,
            onRemoteTrack: (_track, stream, remoteSessionId) => {
              const peerId = remoteSessionToPeer.get(remoteSessionId)
              if (!peerId) {
                console.warn('[use-call] onRemoteTrack: no peer for remoteSessionId', remoteSessionId)
                return
              }
              store.getState().updatePeerStream(peerId, stream)
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

          // Drain sfu-tracks that arrived while the CF session was being created.
          for (const { sessionId, trackNames } of pendingSfuTracks) {
            sfuSession.subscribe(sessionId, trackNames).catch((e) => {
              console.error('[use-call] sfu subscribe failed (buffered)', e)
            })
          }
          pendingSfuTracks.length = 0

          const localStream = store.getState().localStream
          if (localStream) {
            await sfuSession.publish(localStream).catch((e) => {
              // Publish failure leaves the call in a broken state — no media will
              // flow and P2P handlers are disabled. Surface it so the user knows.
              console.error('[use-call] sfu publish failed — no media will be sent', e)
              import('sonner').then(({ toast }) => {
                toast.error('Could not start your camera or microphone. Try leaving and rejoining.')
              })
            })
          }
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
      if (!sfuEnabled) {
        client.off('signal', handleSignal)
      } else {
        client.off('sfu-tracks', handleSfuTracks as (env: Envelope) => void)
      }
      pendingSignals.clear()
      store.getState().clearAll()
    }
    // Intentionally excluding userName/initialAudio/initialVideo: they're
    // captured via joinArgs ref so mute toggles don't rejoin the room.
  }, [client, roomId, enabled, sfuEnabled])
}
