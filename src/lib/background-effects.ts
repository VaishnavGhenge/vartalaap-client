export type BackgroundEffectMode = 'off' | 'blur-subtle' | 'blur-medium' | 'blur-strong' | 'image'

export interface BackgroundEffectPreference {
  mode: BackgroundEffectMode
  imageDataUrl?: string
}

const STORAGE_KEY = 'vartalaap:background-effects'
const LEGACY_FLAGS_KEY = 'vartalaap:flags'
const DEFAULT_PREFERENCE: BackgroundEffectPreference = { mode: 'off' }

type StoredBackgroundEffects = Partial<BackgroundEffectPreference>

type LegacyFlags = {
  background_blur?: boolean
  background_effect?: BackgroundEffectMode
}

let cachedPreference: BackgroundEffectPreference | null = null

function isBackgroundEffectMode(value: unknown): value is BackgroundEffectMode {
  return value === 'off'
    || value === 'blur-subtle'
    || value === 'blur-medium'
    || value === 'blur-strong'
}

function readLegacyPreference(): BackgroundEffectPreference | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(LEGACY_FLAGS_KEY)
    if (!raw) return null
    const legacy = JSON.parse(raw) as LegacyFlags
    if (isBackgroundEffectMode(legacy.background_effect)) return { mode: legacy.background_effect }
    if (legacy.background_blur) return { mode: 'blur-medium' }
    return null
  } catch {
    return null
  }
}

function readPreference(): BackgroundEffectPreference {
  if (typeof window === 'undefined') return DEFAULT_PREFERENCE
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const stored = JSON.parse(raw) as StoredBackgroundEffects
      if (isBackgroundEffectMode(stored.mode)) {
        return {
          mode: stored.mode,
          imageDataUrl: stored.imageDataUrl,
        }
      }
    }
    return readLegacyPreference() ?? DEFAULT_PREFERENCE
  } catch {
    return DEFAULT_PREFERENCE
  }
}

export function getBackgroundEffectPreference(): BackgroundEffectPreference {
  if (!cachedPreference) cachedPreference = readPreference()
  return cachedPreference
}

export function setBackgroundEffectPreference(preference: BackgroundEffectPreference): void {
  cachedPreference = preference

  if (typeof window === 'undefined') return
  try {
    const persistedPreference: BackgroundEffectPreference = preference.mode === 'image'
      ? { mode: 'off' }
      : { mode: preference.mode }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persistedPreference))
  } catch {
    // Background preferences are non-critical. In private browsing or full
    // storage scenarios, keep the in-memory setting for the current call.
  }
}
