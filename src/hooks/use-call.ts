import { useEffect } from 'react'
import type { SignalingClient } from '@/src/services/signaling/client'
import { usePeerStore } from '@/src/stores/peer'
import { fetchIceServers } from '@/src/services/api/ice'
import type {
  Envelope, JoinedData, PeerEventData,
} from '@/src/services/signaling/protocol'
import Peer from 'simple-peer'

interface Args {
  client: SignalingClient | null
  roomId: string
  enabled: boolean
}

export function useCall({ client, roomId, enabled }: Args) {
  useEffect(() => {
    if (!client || !roomId || !enabled) return

    const store = usePeerStore
    let disposed = false

    const makePeer = (remoteId: string, initiator: boolean) => {
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
        console.error('peer error', remoteId, err)
        store.getState().removePeerConnection(remoteId)
      })

      store.getState().addPeerConnection(remoteId, peer)
      return peer
    }

    const handleJoined = (env: Envelope<JoinedData>) => {
      const peers = env.data?.peers ?? []
      for (const remoteId of peers) {
        makePeer(remoteId, true)
      }
    }

    const handlePeerJoined = (env: Envelope<PeerEventData>) => {
      const remoteId = env.data?.peerId
      if (!remoteId) return
      makePeer(remoteId, false)
    }

    const handlePeerLeft = (env: Envelope<PeerEventData>) => {
      const remoteId = env.data?.peerId
      if (!remoteId) return
      store.getState().removePeerConnection(remoteId)
    }

    const handleSignal = (env: Envelope) => {
      if (!env.from) return
      const conn = store.getState().peerConnections.get(env.from)
      if (!conn) {
        console.warn('signal for unknown peer', env.from)
        return
      }
      try {
        conn.peer.signal(env.data as Peer.SignalData)
      } catch (e) {
        console.error('peer.signal failed', e)
      }
    }

    client.on('joined', handleJoined as (env: Envelope) => void)
    client.on('peer-joined', handlePeerJoined as (env: Envelope) => void)
    client.on('peer-left', handlePeerLeft as (env: Envelope) => void)
    client.on('signal', handleSignal)

    ;(async () => {
      try {
        const iceServers = await fetchIceServers()
        if (disposed) return
        store.getState().setIceServers(iceServers)
        client.send('join', undefined, { room: roomId })
      } catch (e) {
        console.error('failed to init call', e)
      }
    })()

    return () => {
      disposed = true
      client.off('joined', handleJoined as (env: Envelope) => void)
      client.off('peer-joined', handlePeerJoined as (env: Envelope) => void)
      client.off('peer-left', handlePeerLeft as (env: Envelope) => void)
      client.off('signal', handleSignal)
      store.getState().clearAll()
    }
  }, [client, roomId, enabled])
}
