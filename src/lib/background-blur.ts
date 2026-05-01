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
  private bgCanvas: HTMLCanvasElement | null = null
  private fgCanvas: HTMLCanvasElement | null = null
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

    const make = (width: number, height: number) => {
      const c = document.createElement('canvas')
      c.width = width
      c.height = height
      return c
    }
    this.bgCanvas = make(w, h)
    this.fgCanvas = make(w, h)
    this.outCanvas = make(w, h)

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
    if (!this.bgCanvas || !this.fgCanvas || !this.outCanvas || !this.video) return
    const mask = result.categoryMask
    if (!mask) return

    const bgCtx = this.bgCanvas.getContext('2d')!
    const fgCtx = this.fgCanvas.getContext('2d')!
    const outCtx = this.outCanvas.getContext('2d')!

    // Blurred background
    bgCtx.filter = `blur(${BLUR_RADIUS}px)`
    bgCtx.drawImage(this.video, 0, 0, w, h)
    bgCtx.filter = 'none'

    // Sharp foreground — zero alpha on background pixels
    fgCtx.drawImage(this.video, 0, 0, w, h)
    const maskValues = mask.getAsUint8Array()
    const fgData = fgCtx.getImageData(0, 0, w, h)
    for (let i = 0; i < maskValues.length; i++) {
      if (maskValues[i] === 0) fgData.data[i * 4 + 3] = 0
    }
    fgCtx.putImageData(fgData, 0, 0)
    mask.close()

    // Compose
    outCtx.drawImage(this.bgCanvas, 0, 0)
    outCtx.drawImage(this.fgCanvas, 0, 0)
  }

  stop() {
    this.running = false
    if (this.timer) { clearInterval(this.timer); this.timer = null }
    this.video?.pause()
    this.video = null
    this.bgCanvas = this.fgCanvas = this.outCanvas = null
  }
}
