import { ImageSegmenter, FilesetResolver } from '@mediapipe/tasks-vision'
import type { ImageSegmenterResult } from '@mediapipe/tasks-vision'

const WASM_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite'
const PROCESS_FPS = 15
const BLUR_RADIUS = 14

// Singleton segmenter — loaded once per session, shared across all processors.
let segmenterPromise: Promise<ImageSegmenter> | null = null

function getSegmenter(): Promise<ImageSegmenter> {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(WASM_CDN)
      return ImageSegmenter.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
        outputCategoryMask: true,
        outputConfidenceMasks: false,
        runningMode: 'VIDEO',
      })
    })().catch((e) => {
      segmenterPromise = null // allow retry on next toggle
      throw e
    })
  }
  return segmenterPromise
}

export class BackgroundBlurProcessor {
  private video: HTMLVideoElement | null = null
  private bgCtx: CanvasRenderingContext2D | null = null
  private fgCtx: CanvasRenderingContext2D | null = null
  private outCtx: CanvasRenderingContext2D | null = null
  private outCanvas: HTMLCanvasElement | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private running = false

  async start(inputTrack: MediaStreamTrack): Promise<MediaStreamTrack> {
    const segmenter = await getSegmenter()

    const settings = inputTrack.getSettings()
    const w = settings.width ?? 640
    const h = settings.height ?? 480

    this.video = document.createElement('video')
    this.video.srcObject = new MediaStream([inputTrack])
    this.video.muted = true
    this.video.playsInline = true
    await this.video.play()

    const make = (width: number, height: number, willReadFrequently = false) => {
      const c = document.createElement('canvas')
      c.width = width
      c.height = height
      return c.getContext('2d', { willReadFrequently })!
    }

    this.bgCtx = make(w, h)
    // willReadFrequently: getImageData is called every frame on this canvas
    this.fgCtx = make(w, h, true)
    this.outCtx = make(w, h)
    this.outCanvas = this.outCtx.canvas

    this.running = true

    this.timer = setInterval(() => {
      if (!this.running || !this.video || this.video.readyState < 2) return
      segmenter.segmentForVideo(this.video, performance.now(), (result) => {
        this.composite(result, w, h)
      })
    }, 1000 / PROCESS_FPS)

    const outTrack = this.outCanvas.captureStream(24).getVideoTracks()[0]
    if (!outTrack) throw new Error('captureStream returned no track')
    return outTrack
  }

  private composite(result: ImageSegmenterResult, w: number, h: number) {
    if (!this.bgCtx || !this.fgCtx || !this.outCtx || !this.video) return
    const mask = result.categoryMask
    if (!mask) return

    // Blurred background
    this.bgCtx.filter = `blur(${BLUR_RADIUS}px)`
    this.bgCtx.drawImage(this.video, 0, 0, w, h)
    this.bgCtx.filter = 'none'

    // Sharp foreground — zero alpha on background pixels
    this.fgCtx.drawImage(this.video, 0, 0, w, h)
    const maskValues = mask.getAsUint8Array()
    const fgData = this.fgCtx.getImageData(0, 0, w, h)
    for (let i = 0; i < maskValues.length; i++) {
      // selfie_segmenter: 0 = person, non-zero = background
      if (maskValues[i] !== 0) fgData.data[i * 4 + 3] = 0
    }
    this.fgCtx.putImageData(fgData, 0, 0)
    mask.close()

    // Compose
    this.outCtx.drawImage(this.bgCtx.canvas, 0, 0)
    this.outCtx.drawImage(this.fgCtx.canvas, 0, 0)
  }

  stop() {
    this.running = false
    if (this.timer) { clearInterval(this.timer); this.timer = null }
    this.video?.pause()
    this.video = null
    this.bgCtx = this.fgCtx = this.outCtx = this.outCanvas = null
  }
}
