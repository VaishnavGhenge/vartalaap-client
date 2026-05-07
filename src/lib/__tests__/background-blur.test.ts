import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ImageSegmenter } from '@mediapipe/tasks-vision'
import { BackgroundBlurProcessor } from '../background-blur'

// MediaPipe is a CDN-loaded WASM module — stub it out entirely.
vi.mock('@mediapipe/tasks-vision', () => ({
    FilesetResolver: {
        forVisionTasks: vi.fn().mockResolvedValue({}),
    },
    ImageSegmenter: {
        createFromOptions: vi.fn().mockResolvedValue({
            segmentForVideo: vi.fn(),
        }),
    },
}))

// jsdom does not implement MediaStream — provide a minimal stub.
if (typeof globalThis.MediaStream === 'undefined') {
    globalThis.MediaStream = class {
        constructor(public tracks: MediaStreamTrack[] = []) {}
    } as unknown as typeof MediaStream
}

// Capture original before any spy is installed to avoid recursive mock calls.
const origCreateElement = document.createElement.bind(document)

function makeTrack(width = 640, height = 480): MediaStreamTrack {
    return {
        getSettings: () => ({ width, height }),
        kind: 'video',
    } as unknown as MediaStreamTrack
}

function makeCanvasTrack(): MediaStreamTrack {
    return { kind: 'video', stop: vi.fn() } as unknown as MediaStreamTrack
}

describe('BackgroundBlurProcessor', () => {
    let processor: BackgroundBlurProcessor

    beforeEach(() => {
        processor = new BackgroundBlurProcessor()

        vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
            if (tag === 'video') {
                // Use the captured original so we don't recurse into the spy.
                const video = origCreateElement('video') as HTMLVideoElement
                vi.spyOn(video, 'play').mockResolvedValue(undefined)
                Object.defineProperty(video, 'readyState', { value: 4, writable: true })
                return video as unknown as HTMLElement
            }
            if (tag === 'canvas') {
                const canvas = origCreateElement('canvas') as HTMLCanvasElement
                canvas.captureStream = vi.fn().mockReturnValue({
                    getVideoTracks: () => [makeCanvasTrack()],
                })
                const ctx = {
                    filter: '',
                    drawImage: vi.fn(),
                    getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(640 * 480 * 4) })),
                    putImageData: vi.fn(),
                    canvas,
                }
                vi.spyOn(canvas, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
                return canvas as unknown as HTMLElement
            }
            return origCreateElement(tag)
        })
    })

    afterEach(() => {
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
    })

    it('stop() is safe to call when never started', () => {
        expect(() => processor.stop()).not.toThrow()
    })

    it('stop() clears the interval after start()', async () => {
        const clearSpy = vi.spyOn(globalThis, 'clearInterval')

        await processor.start(makeTrack())
        processor.stop()

        expect(clearSpy).toHaveBeenCalled()
    })

    it('stop() is idempotent — second call does not throw', async () => {
        await processor.start(makeTrack())
        processor.stop()
        expect(() => processor.stop()).not.toThrow()
    })

    it('start() returns a video track from captureStream', async () => {
        const track = await processor.start(makeTrack())
        expect(track.kind).toBe('video')
    })

    it('start() resolves for non-default track dimensions', async () => {
        await expect(processor.start(makeTrack(1280, 720))).resolves.toBeDefined()
    })

    it('requests confidence and category masks for softer compositing', async () => {
        await processor.start(makeTrack())

        expect(ImageSegmenter.createFromOptions).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                outputCategoryMask: true,
                outputConfidenceMasks: true,
            }),
        )
    })

    it('starts with a custom background image', async () => {
        class FakeImage {
            naturalWidth = 1280
            naturalHeight = 720
            width = 1280
            height = 720
            onload: (() => void) | null = null
            onerror: (() => void) | null = null
            set src(_value: string) {
                queueMicrotask(() => this.onload?.())
            }
        }
        vi.stubGlobal('Image', FakeImage)

        processor = new BackgroundBlurProcessor({ backgroundImageDataUrl: 'data:image/png;base64,abc' })

        await expect(processor.start(makeTrack())).resolves.toBeDefined()
    })
})
