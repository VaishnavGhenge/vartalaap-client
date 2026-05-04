import { ImageSegmenter, FilesetResolver } from '@mediapipe/tasks-vision'
import type { ImageSegmenterResult } from '@mediapipe/tasks-vision'

const WASM_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite'
const PROCESS_FPS = 15
const PERSON_CONFIDENCE_FLOOR = 0.18
const PERSON_CONFIDENCE_CEILING = 0.78

interface BackgroundBlurProcessorOptions {
  blurRadius?: number
  backgroundImageDataUrl?: string
}

// Singleton segmenter — loaded once per session, shared across all processors.
let segmenterPromise: Promise<ImageSegmenter> | null = null

function getSegmenter(): Promise<ImageSegmenter> {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(WASM_CDN)
      return ImageSegmenter.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
        outputCategoryMask: true,
        outputConfidenceMasks: true,
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
  private readonly blurRadius: number
  private readonly backgroundImageDataUrl?: string
  private backgroundImage: HTMLImageElement | null = null
  private video: HTMLVideoElement | null = null
  private bgCtx: CanvasRenderingContext2D | null = null
  private fgCtx: CanvasRenderingContext2D | null = null
  private outCtx: CanvasRenderingContext2D | null = null
  private outCanvas: HTMLCanvasElement | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private running = false

  constructor(options: BackgroundBlurProcessorOptions = { blurRadius: 14 }) {
    this.blurRadius = options.blurRadius ?? 14
    this.backgroundImageDataUrl = options.backgroundImageDataUrl
  }

  async start(inputTrack: MediaStreamTrack): Promise<MediaStreamTrack> {
    const segmenter = await getSegmenter()
    this.backgroundImage = this.backgroundImageDataUrl
      ? await loadImage(this.backgroundImageDataUrl)
      : null

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
    const personAlpha = this.getPersonAlpha(result, w, h)
    if (!personAlpha) return

    if (this.backgroundImage) {
      drawImageCover(this.bgCtx, this.backgroundImage, w, h)
    } else {
      this.bgCtx.filter = `blur(${this.blurRadius}px)`
      this.bgCtx.drawImage(this.video, 0, 0, w, h)
      this.bgCtx.filter = 'none'
    }

    // Sharp foreground — zero alpha on background pixels
    this.fgCtx.drawImage(this.video, 0, 0, w, h)
    const fgData = this.fgCtx.getImageData(0, 0, w, h)
    for (let i = 0; i < personAlpha.length; i++) {
      fgData.data[i * 4 + 3] = personAlpha[i]
    }
    this.fgCtx.putImageData(fgData, 0, 0)

    // Compose
    this.outCtx.drawImage(this.bgCtx.canvas, 0, 0)
    this.outCtx.drawImage(this.fgCtx.canvas, 0, 0)
  }

  private getPersonAlpha(result: ImageSegmenterResult, w: number, h: number): Uint8ClampedArray | null {
    const confidenceMask = result.confidenceMasks?.[0]
    if (confidenceMask) {
      try {
        const confidence = confidenceMask.getAsFloat32Array()
        return this.confidenceToAlpha(confidence)
      } finally {
        result.confidenceMasks?.forEach((mask) => mask.close())
        result.categoryMask?.close()
      }
    }

    const categoryMask = result.categoryMask
    if (!categoryMask) return null
    try {
      const categories = categoryMask.getAsUint8Array()
      return this.categoryToAlpha(categories, w, h)
    } finally {
      categoryMask.close()
    }
  }

  private confidenceToAlpha(confidence: Float32Array): Uint8ClampedArray {
    const alpha = new Uint8ClampedArray(confidence.length)
    for (let i = 0; i < confidence.length; i++) {
      alpha[i] = Math.round(smoothstep(PERSON_CONFIDENCE_FLOOR, PERSON_CONFIDENCE_CEILING, confidence[i]) * 255)
    }
    return alpha
  }

  private categoryToAlpha(categories: Uint8Array, w: number, h: number): Uint8ClampedArray {
    const alpha = new Uint8ClampedArray(categories.length)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x
        if (categories[i] === 0) {
          alpha[i] = 255
          continue
        }

        // Category masks are hard labels. Feather pixels directly touching the
        // person class so the fallback does not produce a saw-tooth edge.
        let touchesPerson = false
        for (let oy = -1; oy <= 1 && !touchesPerson; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            const nx = x + ox
            const ny = y + oy
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
            if (categories[ny * w + nx] === 0) {
              touchesPerson = true
              break
            }
          }
        }
        alpha[i] = touchesPerson ? 96 : 0
      }
    }
    return alpha
  }

  stop() {
    this.running = false
    if (this.timer) { clearInterval(this.timer); this.timer = null }
    this.video?.pause()
    this.video = null
    this.backgroundImage = null
    this.bgCtx = this.fgCtx = this.outCtx = this.outCanvas = null
  }
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const x = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)))
  return x * x * (3 - 2 * x)
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('background image failed to load'))
    image.src = src
  })
}

function drawImageCover(ctx: CanvasRenderingContext2D, image: HTMLImageElement, width: number, height: number): void {
  const imageWidth = image.naturalWidth || image.width
  const imageHeight = image.naturalHeight || image.height
  if (!imageWidth || !imageHeight) return

  const scale = Math.max(width / imageWidth, height / imageHeight)
  const drawWidth = imageWidth * scale
  const drawHeight = imageHeight * scale
  const dx = (width - drawWidth) / 2
  const dy = (height - drawHeight) / 2
  ctx.drawImage(image, dx, dy, drawWidth, drawHeight)
}
