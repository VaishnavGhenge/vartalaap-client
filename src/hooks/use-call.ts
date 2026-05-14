import { useEffect, useRef } from 'react'
import type { SignalingClient } from '@/src/services/signaling/client'
import { usePeerStore } from '@/src/stores/peer'
import { fetchIceServers } from '@/src/services/api/ice'
import type {
  Envelope, JoinedData, PeerJoinedData, PeerLeftData, PeerStateData,
} from '@/src/services/signaling/protocol'
import type { SignalData } from '@/src/services/webrtc/session'
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
    const pendingSignals = new Map<string, SignalData[]>()
    const prevScreenSharing = new Map<string, boolean>()

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

    const handleJoined = (env: Envelope<JoinedData>) => {
      const myId = client.getPeerId()
      const peers = env.data?.peers ?? []
      for (const p of peers) {
        if (p.id === myId) continue
        makeSession(p.id, true, {
          name: p.name,
          audio: p.audio,
          video: p.video,
          screenSharing: p.screenSharing ?? false,
          videoHeld: p.videoHeld ?? false,
        })
      }
    }

    const handlePeerJoined = (env: Envelope<PeerJoinedData>) => {
      const d = env.data
      if (!d?.peerId) return
      if (d.peerId === client.getPeerId()) return
      makeSession(d.peerId, false, {
        name: d.name,
        audio: d.audio,
        video: d.video,
        screenSharing: d.screenSharing ?? false,
        videoHeld: d.videoHeld ?? false,
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

    const handleSignal = (env: Envelope) => {
      if (!env.from) return
      const conn = store.getState().peerConnections.get(env.from)
      if (!conn) {
        const buf = pendingSignals.get(env.from) ?? []
        buf.push(env.data as SignalData)
        pendingSignals.set(env.from, buf)
        return
      }
      void conn.session.signal(env.data as SignalData)
    }

    // On reconnect: clear stale peers and rejoin — the server will send
    // peer-left + peer-joined to the other peers so they recreate their side.
    client.setReconnectedHandler(() => {
      if (disposed) return
      pendingSignals.clear()
      store.getState().clearPeers()
      const a = joinArgs.current
      client.send('join', {
        name: a.userName,
        audio: a.initialAudio,
        video: a.initialVideo,
        presenceId: client.getPresenceId(),
      }, { room: roomId })
    })

    client.on('joined', handleJoined as (env: Envelope) => void)
    client.on('peer-joined', handlePeerJoined as (env: Envelope) => void)
    client.on('peer-left', handlePeerLeft as (env: Envelope) => void)
    client.on('peer-state', handlePeerState as (env: Envelope) => void)
    client.on('signal', handleSignal)

    ;(async () => {
      try {
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
        const a = joinArgs.current
        client.send('join', {
          name: a.userName,
          audio: a.initialAudio,
          video: a.initialVideo,
          presenceId: client.getPresenceId(),
        }, { room: roomId })
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
      client.off('signal', handleSignal)
      pendingSignals.clear()
      store.getState().clearAll()
    }
    // Intentionally excluding userName/initialAudio/initialVideo: they're
    // captured via joinArgs ref so mute toggles don't rejoin the room.
  }, [client, roomId, enabled])
}
