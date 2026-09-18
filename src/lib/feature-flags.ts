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

/**
 * Release switches retained in one place so an emergency rollback can hide a
 * media control without changing the call UI.
 */
export const CALL_FEATURES = {
  screenShare: true,
  cameraFlip: true,
} as const

/**
 * Product surfaces that must only appear when their complete end-to-end flow
 * is ready to ship. Keeping these separate lets us introduce one commercial
 * capability without accidentally exposing the other.
 */
export const PRODUCT_FEATURES = {
  clientPayments: false,
  subscriptions: false,
} as const
