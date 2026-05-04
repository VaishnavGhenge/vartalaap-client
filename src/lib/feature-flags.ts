export type FeatureFlags = {
  experimental_echo_cancel: boolean
}

const DEFAULTS: FeatureFlags = {
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
    if (!raw) return DEFAULTS
    const flags = JSON.parse(raw) as Record<string, unknown>
    delete flags.background_blur
    delete flags.background_effect
    return { ...DEFAULTS, ...flags }
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

export function setFlag<K extends keyof FeatureFlags>(key: K, value: FeatureFlags[K]): void {
  const next = { ...getFlags(), [key]: value }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  cachedFlags = next
  subscribers.forEach((cb) => cb())
}
