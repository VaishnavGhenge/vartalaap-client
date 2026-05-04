import { describe, expect, it, vi, beforeEach } from 'vitest'

async function loadPreferences() {
  vi.resetModules()
  return import('../background-effects')
}

describe('background effect preferences', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('defaults background effects to off', async () => {
    const { getBackgroundEffectPreference } = await loadPreferences()

    expect(getBackgroundEffectPreference()).toMatchObject({ mode: 'off' })
  })

  it('migrates the old background_blur flag to medium blur', async () => {
    localStorage.setItem('vartalaap:flags', JSON.stringify({ background_blur: true }))
    const { getBackgroundEffectPreference } = await loadPreferences()

    expect(getBackgroundEffectPreference()).toMatchObject({ mode: 'blur-medium' })
  })

  it('persists lightweight background effect preferences', async () => {
    const { getBackgroundEffectPreference, setBackgroundEffectPreference } = await loadPreferences()

    setBackgroundEffectPreference({ mode: 'blur-strong' })

    expect(getBackgroundEffectPreference()).toMatchObject({ mode: 'blur-strong' })
    expect(JSON.parse(localStorage.getItem('vartalaap:background-effects') ?? '{}')).toMatchObject({
      mode: 'blur-strong',
    })
  })

  it('keeps image backgrounds in memory without persisting large image data', async () => {
    const { getBackgroundEffectPreference, setBackgroundEffectPreference } = await loadPreferences()

    setBackgroundEffectPreference({ mode: 'image', imageDataUrl: 'blob:http://localhost/background' })

    expect(getBackgroundEffectPreference()).toMatchObject({
      mode: 'image',
      imageDataUrl: 'blob:http://localhost/background',
    })
    expect(JSON.parse(localStorage.getItem('vartalaap:background-effects') ?? '{}')).toMatchObject({
      mode: 'off',
    })
  })
})
