import { useSyncExternalStore } from 'react'
import { getFlags, type FeatureFlags } from '@/src/lib/feature-flags'

function subscribe(cb: () => void) {
  window.addEventListener('storage', cb)
  return () => window.removeEventListener('storage', cb)
}

export function useFeatureFlags(): FeatureFlags {
  return useSyncExternalStore(subscribe, getFlags, () => getFlags())
}
