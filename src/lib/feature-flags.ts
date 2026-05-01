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

// Cached snapshot — same reference until a storage event invalidates it.
// Required by useSyncExternalStore which uses Object.is to detect changes.
let cachedFlags: FeatureFlags | null = null

function readFlags(): FeatureFlags {
  if (typeof window === 'undefined') return DEFAULTS
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

export function getFlags(): FeatureFlags {
  if (!cachedFlags) cachedFlags = readFlags()
  return cachedFlags
}

export function invalidateFlags(): void {
  cachedFlags = readFlags()
}

export function setFlag(key: keyof FeatureFlags, value: boolean): void {
  const flags = getFlags()
  const next = { ...flags, [key]: value }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  cachedFlags = next
  window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }))
}
