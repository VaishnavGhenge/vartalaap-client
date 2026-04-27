import { useEffect, useRef } from 'react'
import type { SignalingClient } from '@/src/services/signaling/client'
import { usePeerStore } from '@/src/stores/peer'
import { fetchIceServers } from '@/src/services/api/ice'
import type {
  Envelope, JoinedData, PeerJoinedData, PeerLeftData, PeerStateData,
} from '@/src/services/signaling/protocol'
import Peer from 'simple-peer'

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
  joinArgs.current = { userName, initialAudio, initialVideo }

  useEffect(() => {
    if (!client || !roomId || !enabled) return

    const store = usePeerStore
    let disposed = false
    const pendingSignals = new Map<string, Peer.SignalData[]>()

    const makePeer = (
      remoteId: string,
      initiator: boolean,
      info: { name: string; audio: boolean; video: boolean },
    ) => {
      if (store.getState().peerConnections.has(remoteId)) {
        store.getState().removePeerConnection(remoteId)
      }
      const localStream = store.getState().localStream ?? undefined
      const peer = store.getState().createPeer(initiator, localStream)

      peer.on('signal', (data) => {
        client.send('signal', data, { to: remoteId })
      })
      peer.on('stream', (stream) => {
        store.getState().updatePeerStream(remoteId, stream)
      })
      peer.on('close', () => {
        store.getState().removePeerConnection(remoteId)
      })
      peer.on('error', (err) => {
        // If the peer is already gone from the store, destroy() was called
        // intentionally (peer-left cleanup) and the resulting WebRTC abort
        // surfaces here — not a real error, ignore it.
        if (!store.getState().peerConnections.has(remoteId)) return
        console.error('peer error', remoteId, err)
        store.getState().removePeerConnection(remoteId)
      })

      store.getState().addPeerConnection(remoteId, peer, info)

      const buffered = pendingSignals.get(remoteId)
      if (buffered) {
        buffered.forEach((data) => {
          try { peer.signal(data) } catch (e) { console.error('buffered signal failed', e) }
        })
        pendingSignals.delete(remoteId)
      }

      return peer
    }

    const handleJoined = (env: Envelope<JoinedData>) => {
      const peers = env.data?.peers ?? []
      for (const p of peers) {
        makePeer(p.id, true, { name: p.name, audio: p.audio, video: p.video })
      }
    }

    const handlePeerJoined = (env: Envelope<PeerJoinedData>) => {
      const d = env.data
      if (!d?.peerId) return
      makePeer(d.peerId, false, { name: d.name, audio: d.audio, video: d.video })
    }

    const handlePeerLeft = (env: Envelope<PeerLeftData>) => {
      const remoteId = env.data?.peerId
      if (!remoteId) return
      store.getState().removePeerConnection(remoteId)
    }

    const handlePeerState = (env: Envelope<PeerStateData>) => {
      if (!env.from || !env.data) return
      // Treat absent speaking field as false — server omits it when null/missing,
      // so we can't use ?? to fall back to the previous value.
      store.getState().updatePeerMediaState(env.from, env.data.audio, env.data.video, env.data.speaking ?? false)
    }

    const handleSignal = (env: Envelope) => {
      if (!env.from) return
      const conn = store.getState().peerConnections.get(env.from)
      if (!conn) {
        const buf = pendingSignals.get(env.from) ?? []
        buf.push(env.data as Peer.SignalData)
        pendingSignals.set(env.from, buf)
        return
      }
      try {
        conn.peer.signal(env.data as Peer.SignalData)
      } catch (e) {
        console.error('peer.signal failed', e)
      }
    }

    // On reconnect: clear stale peers and rejoin — the server will send
    // peer-left + peer-joined to the other peers so they recreate their side.
    client.onReconnected = () => {
      if (disposed) return
      pendingSignals.clear()
      store.getState().clearPeers()
      const a = joinArgs.current
      client.send('join', { name: a.userName, audio: a.initialAudio, video: a.initialVideo }, { room: roomId })
    }

    client.on('joined', handleJoined as (env: Envelope) => void)
    client.on('peer-joined', handlePeerJoined as (env: Envelope) => void)
    client.on('peer-left', handlePeerLeft as (env: Envelope) => void)
    client.on('peer-state', handlePeerState as (env: Envelope) => void)
    client.on('signal', handleSignal)

    ;(async () => {
      try {
        let iceServers: Awaited<ReturnType<typeof fetchIceServers>> = []
        try {
          iceServers = await fetchIceServers()
        } catch (e) {
          console.warn('ICE server fetch failed, proceeding without TURN', e)
        }
        if (disposed) return
        store.getState().setIceServers(iceServers)
        const a = joinArgs.current
        client.send('join', { name: a.userName, audio: a.initialAudio, video: a.initialVideo }, { room: roomId })
      } catch (e) {
        console.error('failed to init call', e)
      }
    })()

    return () => {
      client.send('leave', undefined, { room: roomId })
      disposed = true
      client.onReconnected = undefined
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, roomId, enabled])
}
