export type FeatureFlags = {
  background_blur: boolean
  experimental_echo_cancel: boolean
}

const DEFAULTS: FeatureFlags = {
  background_blur: false,
  experimental_echo_cancel: false,
}

const STORAGE_KEY = 'vartalaap:flags'

// In-memory cache — same reference between calls so useSyncExternalStore
// can detect changes via Object.is.
let cachedFlags: FeatureFlags | null = null

// In-memory subscribers — notified synchronously when setFlag is called.
// Avoids relying on StorageEvent which does not fire on the originating window.
const subscribers = new Set<() => void>()

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

export function subscribeToFlags(cb: () => void): () => void {
  subscribers.add(cb)
  return () => subscribers.delete(cb)
}

export function setFlag(key: keyof FeatureFlags, value: boolean): void {
  const next = { ...getFlags(), [key]: value }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  cachedFlags = next
  subscribers.forEach((cb) => cb())
}
