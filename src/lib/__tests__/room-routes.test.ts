import { describe, expect, it } from 'vitest'
import { normalizeMeetCodeInput, roomPath } from '../room-routes'

describe('room routes', () => {
  it('builds room URLs under the room namespace', () => {
    expect(roomPath('abc-defg-hij')).toBe('/room/abc-defg-hij')
  })

  it('keeps a pasted plain meet code intact', () => {
    expect(normalizeMeetCodeInput('abc-defg-hij')).toBe('abc-defg-hij')
  })

  it('extracts meet codes from room URLs', () => {
    expect(normalizeMeetCodeInput('https://getsessionly.com/room/abc-defg-hij')).toBe('abc-defg-hij')
    expect(normalizeMeetCodeInput('/room/abc-defg-hij')).toBe('abc-defg-hij')
  })

  it('still accepts legacy root room links as pasted input only', () => {
    expect(normalizeMeetCodeInput('https://getsessionly.com/abc-defg-hij')).toBe('abc-defg-hij')
  })
})
