import { useEffect, useRef } from 'react'
import type { SignalingClient } from '@/src/services/signaling/client'
import { usePeerStore } from '@/src/stores/peer'
import { fetchIceServers } from '@/src/services/api/ice'
import type {
  Envelope, JoinedData, PeerJoinedData, PeerLeftData, PeerStateData,
} from '@/src/services/signaling/protocol'
import Peer from 'simple-peer'
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
  joinArgs.current = { userName, initialAudio, initialVideo }

  useEffect(() => {
    if (!client || !roomId || !enabled) return

    const store = usePeerStore
    let disposed = false
    const pendingSignals = new Map<string, Peer.SignalData[]>()
    const prevScreenSharing = new Map<string, boolean>()

    // ICE restart state — lives for the duration of the call.
    const restartAttempts = new Map<string, number>()
    const restartTimers = new Map<string, ReturnType<typeof setTimeout>>()
    const MAX_RESTART_ATTEMPTS = 3

    const makePeer = (
      remoteId: string,
      initiator: boolean,
      info: { name: string; audio: boolean; video: boolean; screenSharing?: boolean },
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
        clearTimeout(restartTimers.get(remoteId))
        restartTimers.delete(remoteId)
        restartAttempts.delete(remoteId)
        store.getState().removePeerConnection(remoteId)
      })
      peer.on('error', (err) => {
        // destroyed=true means destroy() was called intentionally; the
        // OperationError / abort that follows is expected — not a real error.
        if (peer.destroyed) return
        if (!store.getState().peerConnections.has(remoteId)) return
        // OperationError with "Close called" is WebRTC aborting an in-flight
        // replaceTrack because the connection was torn down — expected on hangup.
        if ((err as DOMException).name === 'OperationError') return
        console.error('peer error', remoteId, err)
        store.getState().removePeerConnection(remoteId)
      })

      // ICE restart — initiator only to avoid signaling glare.
      //
      // When connectionState → 'disconnected' the ICE transport has lost its
      // path but hasn't given up yet. We wait 2 s (transient drops recover on
      // their own) then call restartIce(), which re-runs candidate gathering
      // and emits a new offer through the existing signal handler. The DTLS
      // session survives; the remote peer never sees a leave/join event.
      //
      // 'failed' means the browser's ICE agent exhausted all retries — at
      // that point simple-peer destroys the peer, which falls through to the
      // error/close handlers above (existing behaviour).
      if (initiator) {
        const pc = (peer as unknown as { _pc?: RTCPeerConnection })._pc
        if (pc && typeof pc.restartIce === 'function') {
          pc.addEventListener('connectionstatechange', function onStateChange() {
            if (peer.destroyed) {
              pc.removeEventListener('connectionstatechange', onStateChange)
              return
            }

            if (pc.connectionState === 'disconnected') {
              if (restartTimers.has(remoteId)) return  // already scheduled
              const attempt = restartAttempts.get(remoteId) ?? 0
              if (attempt >= MAX_RESTART_ATTEMPTS) return

              restartTimers.set(remoteId, setTimeout(() => {
                restartTimers.delete(remoteId)
                if (peer.destroyed || pc.connectionState !== 'disconnected') return
                restartAttempts.set(remoteId, attempt + 1)
                console.info('[ice-restart] peer=%s attempt=%d', remoteId, attempt + 1)
                pc.restartIce()
              }, 2000))

            } else if (pc.connectionState === 'connected') {
              // Successful (re)connection — clear restart state.
              clearTimeout(restartTimers.get(remoteId))
              restartTimers.delete(remoteId)
              restartAttempts.delete(remoteId)
            }
          })
        }
      }

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
      const myId = client.getPeerId()
      const peers = env.data?.peers ?? []
      for (const p of peers) {
        if (p.id === myId) continue
        makePeer(p.id, true, { name: p.name, audio: p.audio, video: p.video, screenSharing: p.screenSharing ?? false })
      }
    }

    const handlePeerJoined = (env: Envelope<PeerJoinedData>) => {
      const d = env.data
      if (!d?.peerId) return
      if (d.peerId === client.getPeerId()) return
      makePeer(d.peerId, false, { name: d.name, audio: d.audio, video: d.video, screenSharing: d.screenSharing ?? false })
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
      // Treat absent speaking field as false — server omits it when null/missing,
      // so we can't use ?? to fall back to the previous value.
      store.getState().updatePeerMediaState(env.from, env.data.audio, env.data.video, env.data.speaking ?? false, newScreenSharing)
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
        // Skip fetch if ICE servers were pre-fetched on the join screen.
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
      for (const timer of restartTimers.values()) clearTimeout(timer)
      restartTimers.clear()
      restartAttempts.clear()
      store.getState().clearAll()
    }
    // Intentionally excluding userName/initialAudio/initialVideo: they're
    // captured via joinArgs ref so mute toggles don't rejoin the room.
  }, [client, roomId, enabled])
}
