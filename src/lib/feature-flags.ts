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
 * Built and merged, not yet reaching the other side of a call. Shipping these
 * behind a working-looking button costs a user their call and hides what the
 * app is actually doing, so the entry point stays off until the path is fixed
 * and verified end to end.
 *
 * screenShare: the remote peer does not receive the shared screen, and
 *   stopping the share does not restore the camera for them.
 * cameraFlip: switching cameras on mobile does not recover the outbound track.
 */
export const UNRELEASED = {
  screenShare: false,
  cameraFlip: false,
} as const
