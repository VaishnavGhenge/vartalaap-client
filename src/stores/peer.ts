import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import Peer from 'simple-peer'
import type { IceServer } from '@/src/services/api/ice'
import { getSharedAudioContext, setAudioOutputDevice } from '@/src/lib/audio-context'
import { BackgroundBlurProcessor } from '@/src/lib/background-blur'
import { getMicConstraints } from '@/src/lib/audio-constraints'
import {
  getBackgroundEffectPreference,
  setBackgroundEffectPreference,
  type BackgroundEffectMode,
  type BackgroundEffectPreference,
} from '@/src/lib/background-effects'
import { getDevicePreferences, setDevicePreference } from '@/src/lib/device-preferences'

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
  backgroundEffect: BackgroundEffectMode
  backgroundImageDataUrl: string | null
  facingMode: 'user' | 'environment'
  preferredAudioInputId: string
  preferredVideoInputId: string
  preferredAudioOutputId: string
  peerConnections: Map<string, PeerConnection>
  peerStats: Map<string, PeerStats>
  iceServers: IceServer[]

  setIceServers: (s: IceServer[]) => void

  addPeerConnection: (
    id: string,
    peer: Peer.Instance,
    info?: { name?: string; audio?: boolean; video?: boolean; screenSharing?: boolean },
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

  setAudioInput: (deviceId: string) => Promise<void>
  setVideoInput: (deviceId: string) => Promise<void>
  setAudioOutput: (deviceId: string) => Promise<void>

  setBackgroundEffect: (preference: BackgroundEffectPreference) => Promise<boolean>
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

type BlurEffectMode = Extract<BackgroundEffectMode, 'blur-subtle' | 'blur-medium' | 'blur-strong'>

const BLUR_RADIUS_BY_EFFECT: Record<BlurEffectMode, number> = {
  'blur-subtle': 8,
  'blur-medium': 14,
  'blur-strong': 22,
}

const isBlurEffect = (mode: BackgroundEffectMode): mode is BlurEffectMode =>
  mode === 'blur-subtle' || mode === 'blur-medium' || mode === 'blur-strong'

const createBackgroundBlurProcessor = (mode: BlurEffectMode) =>
  new BackgroundBlurProcessor({ blurRadius: BLUR_RADIUS_BY_EFFECT[mode] })

const createBackgroundImageProcessor = (imageDataUrl: string) =>
  new BackgroundBlurProcessor({ backgroundImageDataUrl: imageDataUrl })

const canProcessBackgroundEffect = (preference: BackgroundEffectPreference) =>
  isBlurEffect(preference.mode) || (preference.mode === 'image' && !!preference.imageDataUrl)

const createBackgroundProcessor = (preference: BackgroundEffectPreference) => {
  if (isBlurEffect(preference.mode)) return createBackgroundBlurProcessor(preference.mode)
  if (preference.mode === 'image' && preference.imageDataUrl) return createBackgroundImageProcessor(preference.imageDataUrl)
  return null
}

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
      const pc = (c.peer as unknown as { _pc?: RTCPeerConnection })._pc
      if (!pc) {
        console.warn('[replaceVideoTrack] _pc missing for peer', c.id)
        return
      }
      const sender = pc.getSenders().find(isVideoSender)
      if (!sender) {
        console.warn('[replaceVideoTrack] no video sender for peer', c.id)
        return
      }
      sender.replaceTrack(newTrack)
        .then(() => tuneVideoSenderForCongestion(sender))
        .catch(e => console.error('[replaceVideoTrack] failed for peer', c.id, e))
    } catch (e) {
      console.error('[replaceVideoTrack] error for peer', c.id, e)
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

// Old Android devices throw NotReadableError when the camera hardware is still held
// by a previous track, or NotFoundError when exact constraints aren't supported.
// Retries with progressively simpler constraints before giving up.
async function getUserMediaWithFallback(constraints: MediaStreamConstraints): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia(constraints)
  } catch (e) {
    const name = (e as DOMException).name
    if (name !== 'NotReadableError' && name !== 'NotFoundError') throw e

    // Second attempt: keep facingMode preference but strip resolution/framerate hints
    const videoConstraints = constraints.video
    const facingMode = typeof videoConstraints === 'object'
      ? (videoConstraints as MediaTrackConstraints).facingMode
      : undefined
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: facingMode ? { facingMode: { ideal: facingMode as string } } : true,
        audio: constraints.audio,
      })
    } catch {
      // Last resort: bare video, no constraints
      return await navigator.mediaDevices.getUserMedia({ video: true, audio: constraints.audio })
    }
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
      if (!pc) return
      const sender = pc.getSenders().find(s => s.track?.kind === 'audio')
      if (!sender) return
      sender.replaceTrack(track)
        .catch(e => console.error('[replaceAudioSender] failed for peer', c.id, e))
    } catch (e) {
      console.error('[replaceAudioSender] error for peer', c.id, e)
    }
  })
}

export const usePeerStore = create<PeerState>()(
  devtools((set, get) => {
    const savedDevices = getDevicePreferences()
    return {
    localStream: null,
    screenTrack: null,
    blurProcessor: null,
    rawCameraTrack: null,
    backgroundEffect: getBackgroundEffectPreference().mode,
    backgroundImageDataUrl: getBackgroundEffectPreference().imageDataUrl ?? null,
    facingMode: 'user',
    preferredAudioInputId: savedDevices.audioInputId ?? '',
    preferredVideoInputId: savedDevices.videoInputId ?? '',
    preferredAudioOutputId: savedDevices.audioOutputId ?? '',
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
          screenSharing: info?.screenSharing ?? false,
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
        const { preferredAudioInputId } = get()
        const audioConstraints: MediaTrackConstraints = {
          ...getMicConstraints(),
          ...(preferredAudioInputId ? { deviceId: { exact: preferredAudioInputId } } : {}),
        }
        const media = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints })
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
        const { facingMode, preferredVideoInputId, blurProcessor: activeProcessor, localStream: existingStream, backgroundEffect, backgroundImageDataUrl } = get()
        const videoConstraints: MediaTrackConstraints = preferredVideoInputId
          ? { deviceId: { exact: preferredVideoInputId }, width: { ideal: VIDEO_WIDTH_IDEAL }, height: { ideal: VIDEO_HEIGHT_IDEAL }, frameRate: { ideal: VIDEO_FRAME_RATE_IDEAL } }
          : { facingMode, width: { ideal: VIDEO_WIDTH_IDEAL }, height: { ideal: VIDEO_HEIGHT_IDEAL }, frameRate: { ideal: VIDEO_FRAME_RATE_IDEAL } }
        const media = await getUserMediaWithFallback({ video: videoConstraints })
        const track = media.getVideoTracks()[0]
        if (!track) return null

        existingStream?.getVideoTracks().forEach((t) => t.stop())
        const audioTracks = existingStream?.getAudioTracks() ?? []

        // Auto-apply the saved background effect, or preserve the active effect
        // while replacing the camera track.
        const savedPreference = getBackgroundEffectPreference()
        const nextPreference = activeProcessor !== null
          ? { mode: backgroundEffect, imageDataUrl: backgroundImageDataUrl ?? undefined }
          : savedPreference
        const processor = canProcessBackgroundEffect(nextPreference)
          ? createBackgroundProcessor(nextPreference)
          : null
        if (processor) {
          activeProcessor?.stop()
          try {
            const canvasTrack = await processor.start(track)
            set({
              localStream: new MediaStream([...audioTracks, canvasTrack]),
              blurProcessor: processor,
              rawCameraTrack: track,
              backgroundEffect: nextPreference.mode,
              backgroundImageDataUrl: nextPreference.imageDataUrl ?? null,
            })
            replaceVideoTrackOnPeers(canvasTrack, get().peerConnections)
          } catch {
            set({ localStream: new MediaStream([...audioTracks, track]), blurProcessor: null, rawCameraTrack: null, backgroundEffect: 'off', backgroundImageDataUrl: null })
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
      // The placeholder is stopped on a timer rather than immediately — replaceTrack is
      // async, and stopping the source before it resolves leaves senders with a bad track
      // reference that subsequent replaceTrack calls (e.g. screen share start) cannot find.
      const placeholder = createBlackVideoTrack()
      if (placeholder) {
        replaceVideoTrackOnPeers(placeholder, peerConnections)
        setTimeout(() => placeholder.stop(), 1000)
      }

      const audioTracks = localStream.getAudioTracks()
      set({
        localStream: audioTracks.length > 0 ? new MediaStream(audioTracks) : null,
        blurProcessor: null,
        rawCameraTrack: null,
      })
    },

    switchCamera: async () => {
      const { localStream, facingMode, peerConnections, blurProcessor: activeProcessor, backgroundEffect, backgroundImageDataUrl } = get()
      if (!localStream) return false

      const nextFacing: 'user' | 'environment' = facingMode === 'user' ? 'environment' : 'user'

      try {
        const media = await getUserMediaWithFallback({
          video: {
            facingMode: { ideal: nextFacing },
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
            const newProcessor = createBackgroundProcessor({ mode: backgroundEffect, imageDataUrl: backgroundImageDataUrl ?? undefined })
              ?? createBackgroundBlurProcessor('blur-medium')
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

    setAudioInput: async (deviceId) => {
      setDevicePreference('audioInputId', deviceId)
      set({ preferredAudioInputId: deviceId })
      const { localStream, peerConnections } = get()
      if (!localStream?.getAudioTracks().length) return
      try {
        const audioConstraints: MediaTrackConstraints = {
          ...getMicConstraints(),
          deviceId: { exact: deviceId },
        }
        const media = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints })
        const track = media.getAudioTracks()[0]
        if (!track) return
        localStream.getAudioTracks().forEach(t => { t.stop(); localStream.removeTrack(t) })
        localStream.addTrack(track)
        replaceAudioSenderOnPeers(track, peerConnections)
      } catch (e) {
        console.error('setAudioInput failed', e)
      }
    },

    setVideoInput: async (deviceId) => {
      setDevicePreference('videoInputId', deviceId)
      set({ preferredVideoInputId: deviceId })
      const { localStream, peerConnections, blurProcessor: activeProcessor, backgroundEffect, backgroundImageDataUrl } = get()
      if (!localStream?.getVideoTracks().length) return
      try {
        const media = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: deviceId }, width: { ideal: VIDEO_WIDTH_IDEAL }, height: { ideal: VIDEO_HEIGHT_IDEAL }, frameRate: { ideal: VIDEO_FRAME_RATE_IDEAL } },
        })
        const newTrack = media.getVideoTracks()[0]
        if (!newTrack) return
        const audioTracks = localStream.getAudioTracks()
        localStream.getVideoTracks().forEach(t => t.stop())
        if (activeProcessor) {
          activeProcessor.stop()
          try {
            const newProcessor = createBackgroundProcessor({ mode: backgroundEffect, imageDataUrl: backgroundImageDataUrl ?? undefined })
            if (newProcessor) {
              const canvasTrack = await newProcessor.start(newTrack)
              set({ localStream: new MediaStream([...audioTracks, canvasTrack]), blurProcessor: newProcessor, rawCameraTrack: newTrack })
              replaceVideoTrackOnPeers(canvasTrack, peerConnections)
              return
            }
          } catch { /* fall through to raw track */ }
          set({ blurProcessor: null, rawCameraTrack: null })
        }
        set({ localStream: new MediaStream([...audioTracks, newTrack]) })
        replaceVideoTrackOnPeers(newTrack, peerConnections)
      } catch (e) {
        console.error('setVideoInput failed', e)
      }
    },

    setAudioOutput: async (deviceId) => {
      setDevicePreference('audioOutputId', deviceId)
      set({ preferredAudioOutputId: deviceId })
      await setAudioOutputDevice(deviceId)
    },

    setBackgroundEffect: async (preference) => {
      setBackgroundEffectPreference(preference)
      set({ backgroundEffect: preference.mode, backgroundImageDataUrl: preference.imageDataUrl ?? null })

      const processor = createBackgroundProcessor(preference)
      if (processor) {
        const { localStream, blurProcessor: existing, rawCameraTrack } = get()
        const rawTrack = rawCameraTrack ?? localStream?.getVideoTracks()[0]
        if (!rawTrack) return true
        const oldProcessedTrack = existing ? localStream?.getVideoTracks()[0] : null
        existing?.stop()
        if (oldProcessedTrack && oldProcessedTrack !== rawTrack) oldProcessedTrack.stop()
        try {
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
          set({ blurProcessor: null, rawCameraTrack: null, backgroundEffect: 'off', backgroundImageDataUrl: null })
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
          setTimeout(() => placeholder.stop(), 1000)
        }
      }
    },

    setBackgroundBlur: async (enabled) => get().setBackgroundEffect({ mode: enabled ? 'blur-medium' : 'off' }),

    createPeer: (initiator, localStream) => {
      const { iceServers, screenTrack } = get()

      // Build the initial stream with the tracks that are actually live right now.
      //
      // Previous approach: always use placeholder tracks (silent audio + black video),
      // then swap in the real tracks via replaceTrack() inside a queueMicrotask that
      // accessed simple-peer's internal _pc property. That was fragile: if
      // createBlackVideoTrack() returned null no video sender was ever created, and
      // subsequent replaceVideoTrackOnPeers() calls silently failed because
      // getSenders().find(isVideoSender) returned undefined.
      //
      // This approach: prefer real tracks. Placeholders are only used when no real
      // track exists, ensuring both senders are always pre-negotiated. The SDP
      // produced for the initial offer/answer describes the correct media from the
      // start, and no _pc access is required for new peers.
      const audioTrack = localStream?.getAudioTracks()[0] ?? createSilentAudioTrack()
      // When screen sharing, start with the screen track — not the camera.
      // This guarantees late-joining peers receive the active screen share
      // without any queueMicrotask / replaceTrack dance.
      const videoTrack = screenTrack ?? localStream?.getVideoTracks()[0] ?? createBlackVideoTrack()

      const initStream = new MediaStream()
      if (audioTrack) initStream.addTrack(audioTrack)
      if (videoTrack) initStream.addTrack(videoTrack)

      const peer = new Peer({
        initiator,
        trickle: true,
        stream: initStream,
        config: { iceServers: iceServers as RTCIceServer[] },
      })

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
      const backgroundPreference = getBackgroundEffectPreference()
      blurProcessor?.stop()
      rawCameraTrack?.stop()
      localStream?.getTracks().forEach((t) => t.stop())
      peerConnections.forEach((c) => c.peer.destroy())
      set({
        localStream: null,
        screenTrack: null,
        blurProcessor: null,
        rawCameraTrack: null,
        backgroundEffect: backgroundPreference.mode,
        backgroundImageDataUrl: backgroundPreference.imageDataUrl ?? null,
        peerConnections: new Map(),
        peerStats: new Map(),
      })
    },
  }
  }),
)
