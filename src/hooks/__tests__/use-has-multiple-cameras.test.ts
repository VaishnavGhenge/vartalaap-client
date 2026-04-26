import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useHasMultipleCameras } from '../use-has-multiple-cameras'

afterEach(() => vi.restoreAllMocks())

function stubDevices(devices: { kind: string }[]) {
  vi.stubGlobal('navigator', {
    mediaDevices: {
      enumerateDevices: vi.fn().mockResolvedValue(devices),
    },
  })
}

describe('useHasMultipleCameras', () => {
  it('returns false initially before devices are enumerated', () => {
    stubDevices([
      { kind: 'videoinput' },
      { kind: 'videoinput' },
    ])
    const { result } = renderHook(() => useHasMultipleCameras())
    expect(result.current).toBe(false)
  })

  it('returns false when there is only one video input', async () => {
    stubDevices([{ kind: 'videoinput' }])
    const { result } = renderHook(() => useHasMultipleCameras())
    await act(async () => {})
    expect(result.current).toBe(false)
  })

  it('returns false when there are no video inputs', async () => {
    stubDevices([{ kind: 'audioinput' }, { kind: 'audiooutput' }])
    const { result } = renderHook(() => useHasMultipleCameras())
    await act(async () => {})
    expect(result.current).toBe(false)
  })

  it('returns true when there are two video inputs', async () => {
    stubDevices([
      { kind: 'videoinput' },
      { kind: 'videoinput' },
    ])
    const { result } = renderHook(() => useHasMultipleCameras())
    await act(async () => {})
    expect(result.current).toBe(true)
  })

  it('returns true when there are more than two video inputs', async () => {
    stubDevices([
      { kind: 'videoinput' },
      { kind: 'videoinput' },
      { kind: 'videoinput' },
    ])
    const { result } = renderHook(() => useHasMultipleCameras())
    await act(async () => {})
    expect(result.current).toBe(true)
  })

  it('ignores non-video devices when counting', async () => {
    stubDevices([
      { kind: 'videoinput' },
      { kind: 'audioinput' },
      { kind: 'audiooutput' },
    ])
    const { result } = renderHook(() => useHasMultipleCameras())
    await act(async () => {})
    expect(result.current).toBe(false)
  })

  it('returns false if enumerateDevices is not available', async () => {
    vi.stubGlobal('navigator', { mediaDevices: undefined })
    const { result } = renderHook(() => useHasMultipleCameras())
    await act(async () => {})
    expect(result.current).toBe(false)
  })

  it('returns false if enumerateDevices rejects', async () => {
    vi.stubGlobal('navigator', {
      mediaDevices: {
        enumerateDevices: vi.fn().mockRejectedValue(new Error('denied')),
      },
    })
    const { result } = renderHook(() => useHasMultipleCameras())
    await act(async () => {})
    expect(result.current).toBe(false)
  })
})
