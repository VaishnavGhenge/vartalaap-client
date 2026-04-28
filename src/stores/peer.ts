import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import Peer from 'simple-peer'
import type { IceServer } from '@/src/services/api/ice'

const VIDEO_WIDTH_IDEAL = 960
const VIDEO_HEIGHT_IDEAL = 540
const VIDEO_FRAME_RATE_IDEAL = 24
const VIDEO_MAX_BITRATE_BPS = 900_000

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
  facingMode: 'user' | 'environment'
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
  switchCamera: () => Promise<boolean>

  createPeer: (initiator: boolean, stream?: MediaStream) => Peer.Instance
  clearPeers: () => void
  clearAll: () => void
}

interface AdaptiveVideoSendParameters extends RTCRtpSendParameters {
  degradationPreference?: 'maintain-framerate' | 'maintain-resolution' | 'balanced'
}

const isVideoSender = (sender: RTCRtpSender) => sender.track?.kind === 'video'

const tuneVideoSenderForCongestion = async (sender: RTCRtpSender) => {
  if (!sender.getParameters || !sender.setParameters) return

  try {
    const params = sender.getParameters() as AdaptiveVideoSendParameters
    params.degradationPreference = 'maintain-framerate'
    params.encodings = params.encodings?.length ? params.encodings : [{}]
    params.encodings = params.encodings.map((encoding) => ({
      ...encoding,
      maxBitrate: VIDEO_MAX_BITRATE_BPS,
      maxFramerate: VIDEO_FRAME_RATE_IDEAL,
      scaleResolutionDownBy: Math.max(encoding.scaleResolutionDownBy ?? 1, 1),
    }))
    await sender.setParameters(params)
  } catch (e) {
    console.warn('video sender congestion tuning failed', e)
  }
}

const tunePeerVideoSendersForCongestion = (peer: Peer.Instance) => {
  try {
    const pc = (peer as unknown as { _pc?: RTCPeerConnection })._pc
    pc?.getSenders().filter(isVideoSender).forEach((sender) => {
      void tuneVideoSenderForCongestion(sender)
    })
  } catch (e) {
    console.warn('peer video congestion tuning failed', e)
  }
}

const addTrackToPeers = (
  track: MediaStreamTrack,
  stream: MediaStream,
  peers: Map<string, PeerConnection>,
) => {
  peers.forEach((c) => {
    try {
      c.peer.addTrack(track, stream)
      if (track.kind === 'video') tunePeerVideoSendersForCongestion(c.peer)
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

// Replace video track on all peers without renegotiation; uses _pc directly.
const replaceVideoTrackOnPeers = (
  newTrack: MediaStreamTrack,
  peers: Map<string, PeerConnection>,
) => {
  peers.forEach((c) => {
    try {
      const pc = (c.peer as unknown as { _pc: RTCPeerConnection })._pc
      const sender = pc?.getSenders().find(isVideoSender)
      if (!sender) return
      sender.replaceTrack(newTrack)
      void tuneVideoSenderForCongestion(sender)
    } catch (e) {
      console.error('replaceTrack failed', c.id, e)
    }
  })
}

// Placeholder sent via replaceTrack when camera is disabled so the video sender survives.
const createBlackVideoTrack = (): MediaStreamTrack | null => {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 2
    canvas.height = 2
    return canvas.captureStream(0).getVideoTracks()[0] ?? null
  } catch {
    return null
  }
}

export const usePeerStore = create<PeerState>()(
  devtools((set, get) => ({
    localStream: null,
    facingMode: 'user',
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
        const media = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: { ideal: 48000 },
            channelCount: { ideal: 1 },
          },
        })
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
        const { facingMode } = get()
        const media = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode,
            width: { ideal: VIDEO_WIDTH_IDEAL },
            height: { ideal: VIDEO_HEIGHT_IDEAL },
            frameRate: { ideal: VIDEO_FRAME_RATE_IDEAL },
          },
        })
        const track = media.getVideoTracks()[0]
        if (!track) return null
        const existing = get().localStream
        const stream = existing ?? new MediaStream()
        stream.getVideoTracks().forEach((t) => { t.stop(); stream.removeTrack(t) })
        stream.addTrack(track)
        if (!existing) set({ localStream: stream })
        // Reuse the placeholder sender left by disableCamera; first-timers fall back to addTrack.
        const peers = get().peerConnections
        peers.forEach((c) => {
          try {
            const pc = (c.peer as unknown as { _pc: RTCPeerConnection })._pc
            const sender = pc?.getSenders().find(isVideoSender)
            if (sender) {
              sender.replaceTrack(track)
              void tuneVideoSenderForCongestion(sender)
            } else {
              c.peer.addTrack(track, stream)
              tunePeerVideoSendersForCongestion(c.peer)
            }
          } catch (e) {
            console.error('enableCamera peer track failed', c.id, e)
          }
        })
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
        // replaceTrack(black) keeps the sender alive; peer.removeTrack crashes Safari.
        const placeholder = createBlackVideoTrack()
        if (placeholder) {
          replaceVideoTrackOnPeers(placeholder, peers)
          placeholder.stop()
        }
        t.stop()
        stream.removeTrack(t)
      })
      if (stream.getTracks().length === 0) set({ localStream: null })
    },

    switchCamera: async () => {
      const { localStream, facingMode, peerConnections } = get()
      if (!localStream) return false

      const nextFacing: 'user' | 'environment' = facingMode === 'user' ? 'environment' : 'user'

      try {
        const media = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { exact: nextFacing },
            width: { ideal: VIDEO_WIDTH_IDEAL },
            height: { ideal: VIDEO_HEIGHT_IDEAL },
            frameRate: { ideal: VIDEO_FRAME_RATE_IDEAL },
          },
        })
        const newTrack = media.getVideoTracks()[0]
        if (!newTrack) return false

        // Swap track in the local stream
        localStream.getVideoTracks().forEach((t) => { t.stop(); localStream.removeTrack(t) })
        localStream.addTrack(newTrack)

        // Replace on existing peer connections — no renegotiation needed
        replaceVideoTrackOnPeers(newTrack, peerConnections)

        set({ facingMode: nextFacing })
        return true
      } catch (e) {
        console.error('switchCamera failed', e)
        return false
      }
    },

    createPeer: (initiator, stream) => {
      const { iceServers } = get()
      const peer = new Peer({
        initiator,
        trickle: true,
        stream,
        config: { iceServers: iceServers as RTCIceServer[] },
      })
      queueMicrotask(() => tunePeerVideoSendersForCongestion(peer))
      return peer
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
