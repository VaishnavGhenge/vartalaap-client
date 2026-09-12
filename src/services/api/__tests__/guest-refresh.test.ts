import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { refreshGuestSession } from '../guest-refresh'
import { getRoomToken, setRoomToken } from '../token'

describe('refreshGuestSession', () => {
  beforeEach(() => {
    setRoomToken('old-room-token')
    vi.restoreAllMocks()
  })

  afterEach(() => vi.unstubAllGlobals())

  it('replaces the room token returned by the server', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ sfuToken: 'fresh-room-token' }),
    }))
    await expect(refreshGuestSession()).resolves.toBe(true)
    expect(getRoomToken()).toBe('fresh-room-token')
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/auth/guest/refresh'), expect.objectContaining({
      method: 'POST',
      headers: { Authorization: 'Bearer old-room-token' },
    }))
  })

  it('clears a token the server says can no longer be renewed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }))
    await expect(refreshGuestSession()).resolves.toBe(false)
    expect(getRoomToken()).toBeNull()
  })
})
