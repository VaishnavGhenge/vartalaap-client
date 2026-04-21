import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import Peer from 'simple-peer'
import type { IceServer } from '@/src/services/api/ice'

interface PeerConnection {
  id: string
  peer: Peer.Instance
  stream?: MediaStream
}

interface PeerState {
  localStream: MediaStream | null
  peerConnections: Map<string, PeerConnection>
  isInitialized: boolean
  iceServers: IceServer[]

  setLocalStream: (s: MediaStream | null) => void
  setIceServers: (s: IceServer[]) => void

  addPeerConnection: (id: string, peer: Peer.Instance, stream?: MediaStream) => void
  removePeerConnection: (id: string) => void
  updatePeerStream: (id: string, stream: MediaStream) => void

  initializeCamera: () => Promise<MediaStream | null>
  stopCamera: () => void
  createPeer: (initiator: boolean, stream?: MediaStream) => Peer.Instance
  clearAll: () => void
}

export const usePeerStore = create<PeerState>()(
  devtools((set, get) => ({
    localStream: null,
    peerConnections: new Map(),
    isInitialized: false,
    iceServers: [],

    setLocalStream: (stream) => set({ localStream: stream }),
    setIceServers: (s) => set({ iceServers: s }),

    addPeerConnection: (id, peer, stream) =>
      set((state) => {
        const next = new Map(state.peerConnections)
        next.set(id, { id, peer, stream })
        return { peerConnections: next }
      }),

    removePeerConnection: (id) =>
      set((state) => {
        const next = new Map(state.peerConnections)
        const c = next.get(id)
        if (c) { c.peer.destroy(); next.delete(id) }
        return { peerConnections: next }
      }),

    updatePeerStream: (id, stream) =>
      set((state) => {
        const next = new Map(state.peerConnections)
        const c = next.get(id)
        if (c) next.set(id, { ...c, stream })
        return { peerConnections: next }
      }),

    initializeCamera: async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        set({ localStream: stream, isInitialized: true })
        return stream
      } catch (e) {
        console.error('getUserMedia failed', e)
        return null
      }
    },

    stopCamera: () => {
      get().localStream?.getTracks().forEach(t => t.stop())
      set({ localStream: null, isInitialized: false })
    },

    createPeer: (initiator, stream) => {
      const { iceServers } = get()
      return new Peer({
        initiator,
        trickle: true,
        stream,
        config: { iceServers: iceServers as RTCIceServer[] },
      })
    },

    clearAll: () => {
      const { localStream, peerConnections } = get()
      localStream?.getTracks().forEach(t => t.stop())
      peerConnections.forEach(c => c.peer.destroy())
      set({
        localStream: null,
        peerConnections: new Map(),
        isInitialized: false,
      })
    },
  }))
)
