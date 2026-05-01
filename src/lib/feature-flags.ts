export type FeatureFlags = {
  screen_sharing: boolean
  background_blur: boolean
  experimental_echo_cancel: boolean
}

const DEFAULTS: FeatureFlags = {
  screen_sharing: false,
  background_blur: false,
  experimental_echo_cancel: false,
}

const STORAGE_KEY = 'vartalaap:flags'

export function getFlags(): FeatureFlags {
  if (typeof window === 'undefined') return DEFAULTS
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

export function setFlag(key: keyof FeatureFlags, value: boolean): void {
  const flags = getFlags()
  flags[key] = value
  localStorage.setItem(STORAGE_KEY, JSON.stringify(flags))
  window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }))
}
