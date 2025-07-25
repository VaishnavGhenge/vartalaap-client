import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import Peer from 'simple-peer'

interface PeerConnection {
  id: string
  peer: Peer.Instance
  stream?: MediaStream
}

interface PeerState {
  localStream: MediaStream | null
  peerConnections: Map<string, PeerConnection>
  isInitialized: boolean
  
  // Actions
  setLocalStream: (stream: MediaStream | null) => void
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

    setLocalStream: (stream) =>
      set(() => ({
        localStream: stream,
      })),

    addPeerConnection: (id, peer, stream) =>
      set((state) => {
        const newConnections = new Map(state.peerConnections)
        newConnections.set(id, { id, peer, stream })
        return {
          peerConnections: newConnections,
        }
      }),

    removePeerConnection: (id) =>
      set((state) => {
        const newConnections = new Map(state.peerConnections)
        const connection = newConnections.get(id)
        if (connection) {
          connection.peer.destroy()
          newConnections.delete(id)
        }
        return {
          peerConnections: newConnections,
        }
      }),

    updatePeerStream: (id, stream) =>
      set((state) => {
        const newConnections = new Map(state.peerConnections)
        const connection = newConnections.get(id)
        if (connection) {
          newConnections.set(id, { ...connection, stream })
        }
        return {
          peerConnections: newConnections,
        }
      }),

    initializeCamera: async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        })
        
        set(() => ({
          localStream: stream,
          isInitialized: true,
        }))
        
        return stream
      } catch (error) {
        console.error('Error accessing camera:', error)
        return null
      }
    },

    stopCamera: () => {
      const { localStream } = get()
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop())
        set(() => ({
          localStream: null,
          isInitialized: false,
        }))
      }
    },

    createPeer: (initiator, stream) => {
      const peer = new Peer({
        initiator,
        trickle: false,
        stream,
      })
      
      return peer
    },

    clearAll: () => {
      const { localStream, peerConnections } = get()
      
      // Stop the local stream
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop())
      }
      
      // Destroy all peer connections
      peerConnections.forEach(connection => {
        connection.peer.destroy()
      })
      
      set(() => ({
        localStream: null,
        peerConnections: new Map(),
        isInitialized: false,
      }))
    },
  }))
)