import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { toast } from 'sonner'
import { WebRTCSession, type SignalData, type WebRTCSessionOptions } from '@/src/services/webrtc/session'
import type { IceServer } from '@/src/services/api/ice'
import { getSharedAudioContext, setAudioOutputDevice } from '@/src/lib/audio-context'
import { BackgroundBlurProcessor } from '@/src/lib/background-blur'
import { getMicConstraints } from '@/src/lib/audio-constraints'
import { NoiseSuppressor } from '@/src/lib/noise-suppression'
import {
  getBackgroundEffectPreference,
  setBackgroundEffectPreference,
  type BackgroundEffectMode,
  type BackgroundEffectPreference,
} from '@/src/lib/background-effects'
import { getDevicePreferences, setDevicePreference } from '@/src/lib/device-preferences'

const NOISE_SUPPRESSION_KEY = 'suppress-noise'

function getSavedNoiseSuppression(): boolean {
  try { return localStorage.getItem(NOISE_SUPPRESSION_KEY) === 'true' } catch { return false }
}
function saveNoiseSuppression(enabled: boolean): void {
  try { localStorage.setItem(NOISE_SUPPRESSION_KEY, String(enabled)) } catch { /* noop */ }
}

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
  /** True while outbound video is held back due to sustained poor quality. */
  videoHeld: boolean
  timestamp: number
  frameWidth?: number
  frameHeight?: number
  framesPerSecond?: number
}

interface PeerConnection {
  id: string
  session: WebRTCSession
  stream?: MediaStream
  name: string
  audio: boolean
  video: boolean
  speaking: boolean
  screenSharing: boolean
  connectionState: RTCPeerConnectionState
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
  noiseSuppressor: NoiseSuppressor | null
  rawMicTrack: MediaStreamTrack | null
  suppressNoise: boolean

  setIceServers: (s: IceServer[]) => void
  setSuppressNoise: (enabled: boolean) => Promise<void>

  addPeerConnection: (
    id: string,
    session: WebRTCSession,
    info?: { name?: string; audio?: boolean; video?: boolean; screenSharing?: boolean },
  ) => void
  removePeerConnection: (id: string) => void
  updatePeerStream: (id: string, stream: MediaStream) => void
  updatePeerMediaState: (id: string, audio: boolean, video: boolean, speaking?: boolean, screenSharing?: boolean) => void
  updatePeerConnectionState: (id: string, state: RTCPeerConnectionState) => void
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

  createSession: (
    options: Pick<WebRTCSessionOptions, 'initiator' | 'onSignal' | 'onRemoteStream' | 'onConnectionStateChange'> & { localStream: MediaStream }
  ) => WebRTCSession
  clearPeers: () => void
  clearAll: () => void
}

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

const replaceVideoTrackOnPeers = (
  newTrack: MediaStreamTrack,
  peers: Map<string, PeerConnection>,
) => {
  peers.forEach((c) => {
    c.session.replaceTrack('video', newTrack).catch(e => {
      console.error('[peer] replaceTrack video failed', e)
    })
  })
}

// Placeholder sent via replaceTrack when camera is disabled so the video sender survives.
const createBlackVideoTrack = (): MediaStreamTrack | null => {
  try {
    const canvas = document.createElement('canvas')
    // Match the normal camera envelope. Negotiating a tiny/0fps placeholder and
    // later replacing it with a real camera can make replaceTrack() require
    // renegotiation on stricter browser/device combinations.
    canvas.width = VIDEO_WIDTH_IDEAL
    canvas.height = VIDEO_HEIGHT_IDEAL
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
    return canvas.captureStream(VIDEO_FRAME_RATE_IDEAL).getVideoTracks()[0] ?? null
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
    c.session.replaceTrack('audio', track).catch(e => {
      console.error('[peer] replaceTrack audio failed', e)
    })
  })
}

// Audio senders are always pre-negotiated at session creation, so replaceTrack
// is the only publish path — no addTrack fallback needed.
const publishAudioTrackToPeers = (
  track: MediaStreamTrack,
  peers: Map<string, PeerConnection>,
) => {
  peers.forEach((c) => {
    c.session.replaceTrack('audio', track).catch(e => {
      console.error('[peer] replaceTrack audio failed', e)
    })
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
    noiseSuppressor: null,
    rawMicTrack: null,
    suppressNoise: getSavedNoiseSuppression(),

    setIceServers: (s) => set({ iceServers: s }),

    setSuppressNoise: async (enabled) => {
      saveNoiseSuppression(enabled)
      // Always update the preference state so the toggle reflects immediately,
      // even when the mic is currently off. enableMic() will apply suppression
      // on the next unmute using the saved suppressNoise flag.
      set({ suppressNoise: enabled })

      const { localStream, noiseSuppressor, rawMicTrack, peerConnections } = get()
      const activeMicTrack = rawMicTrack ?? localStream?.getAudioTracks()[0]

      if (enabled) {
        if (!activeMicTrack || noiseSuppressor) return // no mic live, or already active
        try {
          const suppressor = new NoiseSuppressor()
          const processedTrack = await suppressor.start(activeMicTrack)
          localStream?.getAudioTracks().forEach(t => { if (t !== activeMicTrack) { t.stop(); localStream.removeTrack(t) } })
          localStream?.removeTrack(activeMicTrack)
          localStream?.addTrack(processedTrack)
          publishAudioTrackToPeers(processedTrack, peerConnections)
          set({ noiseSuppressor: suppressor, rawMicTrack: activeMicTrack })
        } catch (e) {
          console.error('NoiseSuppressor.start failed', e)
          set({ suppressNoise: false })
          saveNoiseSuppression(false)
          toast.error('Noise suppression unavailable, using raw microphone.')
        }
      } else {
        if (!noiseSuppressor) return
        noiseSuppressor.stop()
        // Restore the raw mic track into the stream and peers.
        if (rawMicTrack && localStream) {
          localStream.getAudioTracks().forEach(t => { t.stop(); localStream.removeTrack(t) })
          localStream.addTrack(rawMicTrack)
          publishAudioTrackToPeers(rawMicTrack, peerConnections)
        }
        set({ noiseSuppressor: null, rawMicTrack: null })
      }
    },

    addPeerConnection: (id, session, info) =>
      set((state) => {
        const next = new Map(state.peerConnections)
        next.set(id, {
          id,
          session,
          name: info?.name ?? '',
          audio: info?.audio ?? false,
          video: info?.video ?? false,
          speaking: false,
          screenSharing: info?.screenSharing ?? false,
          connectionState: 'new',
        })
        return { peerConnections: next }
      }),

    removePeerConnection: (id) =>
      set((state) => {
        const next = new Map(state.peerConnections)
        const c = next.get(id)
        if (c) { c.session.close(); next.delete(id) }
        const nextStats = new Map(state.peerStats)
        nextStats.delete(id)
        return { peerConnections: next, peerStats: nextStats }
      }),

    updatePeerConnectionState: (id, connectionState) =>
      set((state) => {
        const next = new Map(state.peerConnections)
        const c = next.get(id)
        if (c) next.set(id, { ...c, connectionState })
        return { peerConnections: next }
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
        const { preferredAudioInputId, suppressNoise, noiseSuppressor } = get()
        const audioConstraints: MediaTrackConstraints = {
          ...getMicConstraints(),
          ...(preferredAudioInputId ? { deviceId: { exact: preferredAudioInputId } } : {}),
        }
        const media = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints })
        const rawTrack = media.getAudioTracks()[0]
        if (!rawTrack) return null

        const existing = get().localStream
        const stream = existing ?? new MediaStream()
        stream.getAudioTracks().forEach((t) => { t.stop(); stream.removeTrack(t) })

        // Stop any previous noise suppressor before starting a fresh one.
        noiseSuppressor?.stop()

        if (suppressNoise) {
          try {
            const suppressor = new NoiseSuppressor()
            const processedTrack = await suppressor.start(rawTrack)
            stream.addTrack(processedTrack)
            if (!existing) set({ localStream: stream })
            set({ noiseSuppressor: suppressor, rawMicTrack: rawTrack })
            publishAudioTrackToPeers(processedTrack, get().peerConnections)
            return rawTrack
          } catch (e) {
            console.error('NoiseSuppressor.start failed on enableMic, falling back', e)
            // Fall through to publish raw track
          }
        }

        stream.addTrack(rawTrack)
        if (!existing) set({ localStream: stream })
        set({ noiseSuppressor: null, rawMicTrack: null })
        publishAudioTrackToPeers(rawTrack, get().peerConnections)
        return rawTrack
      } catch (e) {
        console.error('enableMic failed', e)
        return null
      }
    },

    disableMic: () => {
      const { localStream, peerConnections, noiseSuppressor, rawMicTrack } = get()
      if (!localStream) return
      // Replace sender with silent placeholder BEFORE stopping the track, so
      // the sender never becomes track-less (avoids negotiation glitches).
      const silent = createSilentAudioTrack()
      if (silent) replaceAudioSenderOnPeers(silent, peerConnections)
      localStream.getAudioTracks().forEach(t => { t.stop(); localStream.removeTrack(t) })
      // Stop the noise suppressor and its raw track.
      noiseSuppressor?.stop()
      rawMicTrack?.stop()
      set({ noiseSuppressor: null, rawMicTrack: null })
      if (localStream.getTracks().length === 0) set({ localStream: null })
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
            toast.error('Background effect unavailable.')
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
            toast.error('Background effect unavailable.')
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
      const { localStream, peerConnections, suppressNoise, noiseSuppressor } = get()
      if (!localStream?.getAudioTracks().length) return
      try {
        const audioConstraints: MediaTrackConstraints = {
          ...getMicConstraints(),
          deviceId: { exact: deviceId },
        }
        const media = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints })
        const rawTrack = media.getAudioTracks()[0]
        if (!rawTrack) return

        noiseSuppressor?.stop()
        localStream.getAudioTracks().forEach(t => { t.stop(); localStream.removeTrack(t) })

        if (suppressNoise) {
          try {
            const suppressor = new NoiseSuppressor()
            const processedTrack = await suppressor.start(rawTrack)
            localStream.addTrack(processedTrack)
            set({ noiseSuppressor: suppressor, rawMicTrack: rawTrack })
            publishAudioTrackToPeers(processedTrack, peerConnections)
            return
          } catch (e) {
            console.error('NoiseSuppressor.start failed on setAudioInput, falling back', e)
          }
        }

        set({ noiseSuppressor: null, rawMicTrack: null })
        localStream.addTrack(rawTrack)
        publishAudioTrackToPeers(rawTrack, peerConnections)
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
      try {
        await setAudioOutputDevice(deviceId)
      } catch (e) {
        console.warn('[peer] setAudioOutput failed', e)
        toast.error('Could not switch audio output. Check browser permissions.')
      }
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
          toast.error('Background effect unavailable.')
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
      if (typeof navigator.mediaDevices?.getDisplayMedia !== 'function') return null
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

    createSession: ({ initiator, localStream, onSignal, onRemoteStream, onConnectionStateChange }) => {
      const { iceServers, screenTrack } = get()

      // Prefer real tracks; placeholders only when nothing live is available.
      // Senders for both audio and video are pre-negotiated at creation so
      // replaceTrack() always finds an existing sender — no renegotiation needed.
      const audioTrack = localStream.getAudioTracks()[0] ?? createSilentAudioTrack()
      // Screen share takes priority: late-joining peers get the active screen
      // share without any replaceTrack dance.
      const videoTrack = screenTrack ?? localStream.getVideoTracks()[0] ?? createBlackVideoTrack()

      const initStream = new MediaStream()
      if (audioTrack) initStream.addTrack(audioTrack)
      if (videoTrack) initStream.addTrack(videoTrack)

      return new WebRTCSession({
        iceServers: iceServers as RTCIceServer[],
        initiator,
        localStream: initStream,
        onSignal,
        onRemoteStream,
        onConnectionStateChange,
      })
    },

    clearPeers: () => {
      const { peerConnections } = get()
      peerConnections.forEach((c) => c.session.close())
      set({ peerConnections: new Map(), peerStats: new Map() })
    },

    clearAll: () => {
      const { localStream, peerConnections, blurProcessor, rawCameraTrack, noiseSuppressor, rawMicTrack } = get()
      const backgroundPreference = getBackgroundEffectPreference()
      blurProcessor?.stop()
      rawCameraTrack?.stop()
      noiseSuppressor?.stop()
      rawMicTrack?.stop()
      localStream?.getTracks().forEach((t) => t.stop())
      peerConnections.forEach((c) => c.session.close())
      set({
        localStream: null,
        screenTrack: null,
        blurProcessor: null,
        rawCameraTrack: null,
        noiseSuppressor: null,
        rawMicTrack: null,
        backgroundEffect: backgroundPreference.mode,
        backgroundImageDataUrl: backgroundPreference.imageDataUrl ?? null,
        peerConnections: new Map(),
        peerStats: new Map(),
      })
    },
  }
  }),
)
