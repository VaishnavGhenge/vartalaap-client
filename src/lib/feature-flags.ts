export type FeatureFlags = {}

const STORAGE_KEY = 'vartalaap:flags'

// Migrate: remove all legacy flag keys that are no longer user-controlled.
export function migrateFlags(): void {
  if (typeof window === 'undefined') return
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    localStorage.removeItem(STORAGE_KEY)
  } catch { /* non-critical */ }
}
