import { useSyncExternalStore } from 'react'
import { getFlags, invalidateFlags, type FeatureFlags } from '@/src/lib/feature-flags'

function subscribe(cb: () => void) {
  const handler = () => { invalidateFlags(); cb() }
  window.addEventListener('storage', handler)
  return () => window.removeEventListener('storage', handler)
}

export function useFeatureFlags(): FeatureFlags {
  return useSyncExternalStore(subscribe, getFlags, getFlags)
}
