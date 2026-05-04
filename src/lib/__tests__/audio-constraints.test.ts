import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getMicConstraints } from '../audio-constraints'

afterEach(() => vi.unstubAllGlobals())

describe('getMicConstraints', () => {
  describe('base constraints (all browsers)', () => {
    it('enables echoCancellation, noiseSuppression, and autoGainControl', () => {
      const c = getMicConstraints()
      expect(c.echoCancellation).toBe(true)
      expect(c.noiseSuppression).toBe(true)
      expect(c.autoGainControl).toBe(true)
    })

    it('requests 48 kHz sample rate', () => {
      expect(getMicConstraints().sampleRate).toEqual({ ideal: 48000 })
    })

    it('requests mono channel', () => {
      expect(getMicConstraints().channelCount).toEqual({ ideal: 1 })
    })

    it('requests lowest possible capture latency', () => {
      const c = getMicConstraints() as Record<string, unknown>
      expect(c['latency']).toEqual({ ideal: 0 })
    })
  })

  describe('on Chromium browsers', () => {
    beforeEach(() => {
      vi.stubGlobal('window', { ...globalThis.window, chrome: {} })
    })

    it('includes AEC3 and neural noise suppressor hints', () => {
      const c = getMicConstraints() as Record<string, unknown>
      expect(c['googEchoCancellation']).toBe(true)
      expect(c['googExperimentalEchoCancellation']).toBe(true)
      expect(c['googNoiseSuppression']).toBe(true)
      expect(c['googExperimentalNoiseSuppression']).toBe(true)
    })

    it('enables high-pass filter and typing noise detection', () => {
      const c = getMicConstraints() as Record<string, unknown>
      expect(c['googHighpassFilter']).toBe(true)
      expect(c['googTypingNoiseDetection']).toBe(true)
    })

    it('disables audio mirroring to prevent loopback echo', () => {
      const c = getMicConstraints() as Record<string, unknown>
      expect(c['googAudioMirroring']).toBe(false)
    })

    it('forces desktop-quality AEC pipeline on mobile Chrome', () => {
      const c = getMicConstraints() as Record<string, unknown>
      expect(c['googEchoCancellationMobileMode']).toBe(false)
    })
  })

  describe('on non-Chromium browsers (Firefox, Safari)', () => {
    beforeEach(() => {
      const w = { ...globalThis.window } as Record<string, unknown>
      delete w['chrome']
      vi.stubGlobal('window', w)
    })

    it('still includes standard WebRTC constraints', () => {
      const c = getMicConstraints()
      expect(c.echoCancellation).toBe(true)
      expect(c.noiseSuppression).toBe(true)
      expect(c.sampleRate).toEqual({ ideal: 48000 })
    })

    it('does not include Chrome-specific hints', () => {
      const c = getMicConstraints() as Record<string, unknown>
      expect('googEchoCancellation' in c).toBe(false)
      expect('googExperimentalEchoCancellation' in c).toBe(false)
      expect('googNoiseSuppression' in c).toBe(false)
      expect('googHighpassFilter' in c).toBe(false)
    })
  })
})
