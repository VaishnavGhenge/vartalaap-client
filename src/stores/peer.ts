import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import Peer from 'simple-peer'
import type { IceServer } from '@/src/services/api/ice'
import { getSharedAudioContext } from '@/src/lib/audio-context'
import { BackgroundBlurProcessor } from '@/src/lib/background-blur'
import { getFlags } from '@/src/lib/feature-flags'

const VIDEO_WIDTH_IDEAL = 960
const VIDEO_HEIGHT_IDEAL = 540
const VIDEO_FRAME_RATE_IDEAL = 24
const VIDEO_MAX_BITRATE_BPS = 900_000

// Encoding level set by the adaptive controller.
// 2 = full quality (900 kbps, 960×540, 24 fps) — default
// 1 = medium      (500 kbps, 640×360, 20 fps)
// 0 = reduced     (200 kbps, 480×270, 15 fps)
export type EncodingLevel = 0 | 1 | 2

export interface PeerStats {
  outboundBitrateKbps: number
  inboundBitrateKbps: number
  packetLossPercent: number
  roundTripTimeMs: number   // -1 = not yet known
  jitterMs: number
  candidateType: 'host' | 'srflx' | 'relay' | 'unknown'
  quality: 'good' | 'medium' | 'poor' | 'unknown'
  encodingLevel: EncodingLevel
  timestamp: number
  frameWidth?: number
  frameHeight?: number
  framesPerSecond?: number
}

interface PeerConnection {
  id: string
  peer: Peer.Instance
  stream?: MediaStream
  name: string
  audio: boolean
  video: boolean
  speaking: boolean
  screenSharing: boolean
}

interface PeerState {
  localStream: MediaStream | null
  screenTrack: MediaStreamTrack | null
  blurProcessor: BackgroundBlurProcessor | null
  rawCameraTrack: MediaStreamTrack | null
  facingMode: 'user' | 'environment'
  peerConnections: Map<string, PeerConnection>
  peerStats: Map<string, PeerStats>
  iceServers: IceServer[]

  setIceServers: (s: IceServer[]) => void

  addPeerConnection: (
    id: string,
    peer: Peer.Instance,
    info?: { name?: string; audio?: boolean; video?: boolean },
  ) => void
  removePeerConnection: (id: string) => void
  updatePeerStream: (id: string, stream: MediaStream) => void
  updatePeerMediaState: (id: string, audio: boolean, video: boolean, speaking?: boolean, screenSharing?: boolean) => void
  updatePeerStats: (id: string, stats: PeerStats) => void

  enableMic: () => Promise<MediaStreamTrack | null>
  disableMic: () => void
  enableCamera: () => Promise<MediaStreamTrack | null>
  disableCamera: () => void
  switchCamera: () => Promise<boolean>

  setBackgroundBlur: (enabled: boolean) => Promise<boolean>

  startScreenShare: () => Promise<MediaStreamTrack | null>
  stopScreenShare: () => void

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

// Silent audio placeholder so the audio sender is pre-negotiated at peer creation.
// Avoids mid-call addTrack() renegotiation when the user enables the mic later.
const createSilentAudioTrack = (): MediaStreamTrack | null => {
  try {
    const ctx = getSharedAudioContext()
    if (!ctx) return null
    return ctx.createMediaStreamDestination().stream.getAudioTracks()[0] ?? null
  } catch {
    return null
  }
}

const replaceAudioSenderOnPeers = (
  track: MediaStreamTrack,
  peers: Map<string, PeerConnection>,
) => {
  peers.forEach((c) => {
    try {
      const pc = (c.peer as unknown as { _pc?: RTCPeerConnection })._pc
      const sender = pc?.getSenders().find(s => s.track?.kind === 'audio')
      if (sender) void sender.replaceTrack(track)
    } catch (e) {
      console.error('replaceAudioSender failed', c.id, e)
    }
  })
}

export const usePeerStore = create<PeerState>()(
  devtools((set, get) => ({
    localStream: null,
    screenTrack: null,
    blurProcessor: null,
    rawCameraTrack: null,
    facingMode: 'user',
    peerConnections: new Map(),
    peerStats: new Map(),
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
          screenSharing: false,
        })
        return { peerConnections: next }
      }),

    removePeerConnection: (id) =>
      set((state) => {
        const next = new Map(state.peerConnections)
        const c = next.get(id)
        if (c) { c.peer.destroy(); next.delete(id) }
        const nextStats = new Map(state.peerStats)
        nextStats.delete(id)
        return { peerConnections: next, peerStats: nextStats }
      }),

    updatePeerStats: (id, stats) =>
      set((state) => {
        const next = new Map(state.peerStats)
        next.set(id, stats)
        return { peerStats: next }
      }),

    updatePeerStream: (id, stream) =>
      set((state) => {
        const next = new Map(state.peerConnections)
        const c = next.get(id)
        if (c) next.set(id, { ...c, stream })
        return { peerConnections: next }
      }),

    updatePeerMediaState: (id, audio, video, speaking, screenSharing) =>
      set((state) => {
        const next = new Map(state.peerConnections)
        const c = next.get(id)
        if (c) next.set(id, {
          ...c,
          audio,
          video,
          speaking: speaking ?? c.speaking,
          screenSharing: screenSharing ?? c.screenSharing,
        })
        return { peerConnections: next }
      }),

    enableMic: async () => {
      try {
        const { experimental_echo_cancel } = getFlags()
        const media = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: { ideal: 48000 },
            channelCount: { ideal: 1 },
            latency: { ideal: 0 },
            // Chrome-specific enhanced AEC — enabled via experimental_echo_cancel flag.
            // These hints activate Chromium's AEC3, experimental NS, and high-pass filter.
            ...(experimental_echo_cancel && {
              googEchoCancellation: true,
              googExperimentalEchoCancellation: true,
              googNoiseSuppression: true,
              googHighpassFilter: true,
              googAudioMirroring: false,
            }),
          } as MediaTrackConstraints,
        })
        const track = media.getAudioTracks()[0]
        if (!track) return null
        const existing = get().localStream
        const stream = existing ?? new MediaStream()
        stream.getAudioTracks().forEach((t) => { t.stop(); stream.removeTrack(t) })
        stream.addTrack(track)
        if (!existing) set({ localStream: stream })
        // Replace the silent placeholder on all peers — no renegotiation.
        replaceAudioSenderOnPeers(track, get().peerConnections)
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
      // Replace sender with silent placeholder BEFORE stopping the track, so
      // the sender never becomes track-less (avoids negotiation glitches).
      const silent = createSilentAudioTrack()
      if (silent) replaceAudioSenderOnPeers(silent, peers)
      stream.getAudioTracks().forEach(t => { t.stop(); stream.removeTrack(t) })
      if (stream.getTracks().length === 0) set({ localStream: null })
    },

    enableCamera: async () => {
      try {
        const { facingMode, blurProcessor: activeProcessor, localStream: existingStream } = get()
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

        existingStream?.getVideoTracks().forEach((t) => t.stop())
        const audioTracks = existingStream?.getAudioTracks() ?? []

        // Auto-apply blur if the feature flag is on, or if a processor was already running.
        const wantBlur = activeProcessor !== null || getFlags().background_blur
        if (wantBlur) {
          activeProcessor?.stop()
          try {
            const newProcessor = new BackgroundBlurProcessor()
            const canvasTrack = await newProcessor.start(track)
            set({ localStream: new MediaStream([...audioTracks, canvasTrack]), blurProcessor: newProcessor, rawCameraTrack: track })
            replaceVideoTrackOnPeers(canvasTrack, get().peerConnections)
          } catch {
            set({ localStream: new MediaStream([...audioTracks, track]), blurProcessor: null, rawCameraTrack: null })
            replaceVideoTrackOnPeers(track, get().peerConnections)
          }
        } else {
          set({ localStream: new MediaStream([...audioTracks, track]) })
          replaceVideoTrackOnPeers(track, get().peerConnections)
        }

        return track
      } catch (e) {
        console.error('enableCamera failed', e)
        return null
      }
    },

    disableCamera: () => {
      const { localStream, peerConnections, blurProcessor, rawCameraTrack } = get()
      if (!localStream) return

      if (blurProcessor) {
        blurProcessor.stop()
        rawCameraTrack?.stop()
      }

      localStream.getVideoTracks().forEach((t) => t.stop())

      // replaceTrack(black) keeps the sender alive; peer.removeTrack crashes Safari.
      const placeholder = createBlackVideoTrack()
      if (placeholder) {
        replaceVideoTrackOnPeers(placeholder, peerConnections)
        placeholder.stop()
      }

      const audioTracks = localStream.getAudioTracks()
      set({
        localStream: audioTracks.length > 0 ? new MediaStream(audioTracks) : null,
        blurProcessor: null,
        rawCameraTrack: null,
      })
    },

    switchCamera: async () => {
      const { localStream, facingMode, peerConnections, blurProcessor: activeProcessor } = get()
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

        localStream.getVideoTracks().forEach((t) => t.stop())
        const audioTracks = localStream.getAudioTracks()

        if (activeProcessor) {
          activeProcessor.stop()
          try {
            const newProcessor = new BackgroundBlurProcessor()
            const canvasTrack = await newProcessor.start(newTrack)
            set({ localStream: new MediaStream([...audioTracks, canvasTrack]), facingMode: nextFacing, blurProcessor: newProcessor, rawCameraTrack: newTrack })
            replaceVideoTrackOnPeers(canvasTrack, peerConnections)
          } catch {
            set({ localStream: new MediaStream([...audioTracks, newTrack]), facingMode: nextFacing, blurProcessor: null, rawCameraTrack: null })
            replaceVideoTrackOnPeers(newTrack, peerConnections)
          }
        } else {
          set({ localStream: new MediaStream([...audioTracks, newTrack]), facingMode: nextFacing })
          replaceVideoTrackOnPeers(newTrack, peerConnections)
        }

        return true
      } catch (e) {
        console.error('switchCamera failed', e)
        return false
      }
    },

    setBackgroundBlur: async (enabled) => {
      if (enabled) {
        const { localStream, blurProcessor: existing } = get()
        if (existing) return true
        const rawTrack = localStream?.getVideoTracks()[0]
        if (!rawTrack) return false
        try {
          const processor = new BackgroundBlurProcessor()
          const canvasTrack = await processor.start(rawTrack)
          // Replace localStream with a new object so useAttachTracks re-syncs the video element.
          const newStream = new MediaStream([...(localStream!.getAudioTracks()), canvasTrack])
          replaceVideoTrackOnPeers(canvasTrack, get().peerConnections)
          set({ localStream: newStream, blurProcessor: processor, rawCameraTrack: rawTrack })
          return true
        } catch (e) {
          console.error('background blur failed', e)
          return false
        }
      } else {
        const { blurProcessor, rawCameraTrack, localStream } = get()
        if (!blurProcessor) return true
        blurProcessor.stop()
        const canvasTrack = localStream?.getVideoTracks()[0]
        canvasTrack?.stop()
        if (rawCameraTrack && localStream) {
          const newStream = new MediaStream([...localStream.getAudioTracks(), rawCameraTrack])
          replaceVideoTrackOnPeers(rawCameraTrack, get().peerConnections)
          set({ localStream: newStream, blurProcessor: null, rawCameraTrack: null })
        } else {
          set({ blurProcessor: null, rawCameraTrack: null })
        }
        return true
      }
    },

    startScreenShare: async () => {
      try {
        // selfBrowserSurface: 'exclude' (Chrome 107+) removes the current tab
        // from the picker, breaking the most common infinite-mirror path.
        const media = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
          selfBrowserSurface: 'exclude',
        } as DisplayMediaStreamOptions)
        const track = media.getVideoTracks()[0]
        if (!track) return null
        // Push the screen track to peers via replaceTrack — no renegotiation.
        replaceVideoTrackOnPeers(track, get().peerConnections)
        set({ screenTrack: track })
        return track
      } catch (e) {
        // User cancelled the picker — not an error worth logging.
        if ((e as Error).name !== 'NotAllowedError') console.error('startScreenShare failed', e)
        return null
      }
    },

    stopScreenShare: () => {
      set({ screenTrack: null })
      // Restore peers to the current local camera track, or a black placeholder
      // if the camera is currently off.
      const stream = get().localStream
      const cameraTrack = stream?.getVideoTracks()[0] ?? null
      if (cameraTrack) {
        replaceVideoTrackOnPeers(cameraTrack, get().peerConnections)
      } else {
        const placeholder = createBlackVideoTrack()
        if (placeholder) {
          replaceVideoTrackOnPeers(placeholder, get().peerConnections)
          placeholder.stop()
        }
      }
    },

    createPeer: (initiator, localStream) => {
      const { iceServers } = get()

      // Always start with placeholder audio+video so both senders are
      // pre-negotiated. Real tracks are swapped in via replaceTrack() which
      // never triggers renegotiation, regardless of when the user enables media.
      const initStream = new MediaStream()
      const silentTrack = createSilentAudioTrack()
      const blackTrack  = createBlackVideoTrack()
      if (silentTrack) initStream.addTrack(silentTrack)
      if (blackTrack)  initStream.addTrack(blackTrack)

      const peer = new Peer({
        initiator,
        trickle: true,
        stream: initStream,
        config: { iceServers: iceServers as RTCIceServer[] },
      })

      // Replace placeholders with live tracks once the RTCPeerConnection exists.
      // If a screen share is in progress, send that as the video track so
      // late-joining peers immediately see the shared screen.
      if (localStream) {
        queueMicrotask(() => {
          const pc = (peer as unknown as { _pc?: RTCPeerConnection })._pc
          if (!pc) return
          const { screenTrack } = get()
          for (const track of localStream.getTracks()) {
            const liveTrack = track.kind === 'video' && screenTrack ? screenTrack : track
            const sender = pc.getSenders().find(s => s.track?.kind === liveTrack.kind)
            if (sender) void sender.replaceTrack(liveTrack)
          }
        })
      }

      queueMicrotask(() => tunePeerVideoSendersForCongestion(peer))
      return peer
    },

    clearPeers: () => {
      const { peerConnections } = get()
      peerConnections.forEach((c) => c.peer.destroy())
      set({ peerConnections: new Map(), peerStats: new Map() })
    },

    clearAll: () => {
      const { localStream, peerConnections, blurProcessor, rawCameraTrack } = get()
      blurProcessor?.stop()
      rawCameraTrack?.stop()
      localStream?.getTracks().forEach((t) => t.stop())
      peerConnections.forEach((c) => c.peer.destroy())
      set({
        localStream: null,
        screenTrack: null,
        blurProcessor: null,
        rawCameraTrack: null,
        peerConnections: new Map(),
        peerStats: new Map(),
      })
    },
  })),
)
