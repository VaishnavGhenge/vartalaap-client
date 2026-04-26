import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import Peer from 'simple-peer'
import type { IceServer } from '@/src/services/api/ice'

interface PeerConnection {
  id: string
  peer: Peer.Instance
  stream?: MediaStream
  name: string
  audio: boolean
  video: boolean
  speaking: boolean
}

interface PeerState {
  localStream: MediaStream | null
  peerConnections: Map<string, PeerConnection>
  iceServers: IceServer[]

  setIceServers: (s: IceServer[]) => void

  addPeerConnection: (
    id: string,
    peer: Peer.Instance,
    info?: { name?: string; audio?: boolean; video?: boolean },
  ) => void
  removePeerConnection: (id: string) => void
  updatePeerStream: (id: string, stream: MediaStream) => void
  updatePeerMediaState: (id: string, audio: boolean, video: boolean, speaking?: boolean) => void

  enableMic: () => Promise<MediaStreamTrack | null>
  disableMic: () => void
  enableCamera: () => Promise<MediaStreamTrack | null>
  disableCamera: () => void

  createPeer: (initiator: boolean, stream?: MediaStream) => Peer.Instance
  clearPeers: () => void
  clearAll: () => void
}

const addTrackToPeers = (
  track: MediaStreamTrack,
  stream: MediaStream,
  peers: Map<string, PeerConnection>,
) => {
  peers.forEach((c) => {
    try {
      c.peer.addTrack(track, stream)
    } catch (e) {
      console.error('peer.addTrack failed', c.id, e)
    }
  })
}

const removeTrackFromPeers = (
  track: MediaStreamTrack,
  stream: MediaStream,
  peers: Map<string, PeerConnection>,
) => {
  peers.forEach((c) => {
    try {
      c.peer.removeTrack(track, stream)
    } catch (e) {
      console.error('peer.removeTrack failed', c.id, e)
    }
  })
}

export const usePeerStore = create<PeerState>()(
  devtools((set, get) => ({
    localStream: null,
    peerConnections: new Map(),
    iceServers: [],

    setIceServers: (s) => set({ iceServers: s }),

    addPeerConnection: (id, peer, info) =>
      set((state) => {
        const next = new Map(state.peerConnections)
        next.set(id, {
          id,
          peer,
          name: info?.name ?? '',
          audio: info?.audio ?? false,
          video: info?.video ?? false,
          speaking: false,
        })
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

    updatePeerMediaState: (id, audio, video, speaking) =>
      set((state) => {
        const next = new Map(state.peerConnections)
        const c = next.get(id)
        if (c) next.set(id, { ...c, audio, video, speaking: speaking ?? c.speaking })
        return { peerConnections: next }
      }),

    enableMic: async () => {
      try {
        const media = await navigator.mediaDevices.getUserMedia({ audio: true })
        const track = media.getAudioTracks()[0]
        if (!track) return null
        const existing = get().localStream
        const stream = existing ?? new MediaStream()
        stream.getAudioTracks().forEach((t) => { t.stop(); stream.removeTrack(t) })
        stream.addTrack(track)
        if (!existing) set({ localStream: stream })
        addTrackToPeers(track, stream, get().peerConnections)
        return track
      } catch (e) {
        console.error('enableMic failed', e)
        return null
      }
    },

    disableMic: () => {
      const stream = get().localStream
      if (!stream) return
      const peers = get().peerConnections
      stream.getAudioTracks().forEach((t) => {
        removeTrackFromPeers(t, stream, peers)
        t.stop()
        stream.removeTrack(t)
      })
      if (stream.getTracks().length === 0) set({ localStream: null })
    },

    enableCamera: async () => {
      try {
        const media = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        })
        const track = media.getVideoTracks()[0]
        if (!track) return null
        const existing = get().localStream
        const stream = existing ?? new MediaStream()
        stream.getVideoTracks().forEach((t) => { t.stop(); stream.removeTrack(t) })
        stream.addTrack(track)
        if (!existing) set({ localStream: stream })
        addTrackToPeers(track, stream, get().peerConnections)
        return track
      } catch (e) {
        console.error('enableCamera failed', e)
        return null
      }
    },

    disableCamera: () => {
      const stream = get().localStream
      if (!stream) return
      const peers = get().peerConnections
      stream.getVideoTracks().forEach((t) => {
        removeTrackFromPeers(t, stream, peers)
        t.stop()
        stream.removeTrack(t)
      })
      if (stream.getTracks().length === 0) set({ localStream: null })
    },

    createPeer: (initiator, stream) => {
      const { iceServers } = get()
      return new Peer({
        initiator,
        trickle: true,
        stream,
        config: { iceServers: iceServers as RTCIceServer[] },
        sdpTransform: (sdp: string) => sdp.replace(/b=AS:\d+/g, 'b=AS:2500'),
      })
    },

    clearPeers: () => {
      const { peerConnections } = get()
      peerConnections.forEach((c) => c.peer.destroy())
      set({ peerConnections: new Map() })
    },

    clearAll: () => {
      const { localStream, peerConnections } = get()
      localStream?.getTracks().forEach((t) => t.stop())
      peerConnections.forEach((c) => c.peer.destroy())
      set({
        localStream: null,
        peerConnections: new Map(),
      })
    },
  })),
)
