import { useSyncExternalStore } from 'react'
import { getFlags, subscribeToFlags, type FeatureFlags } from '@/src/lib/feature-flags'

export function useFeatureFlags(): FeatureFlags {
  return useSyncExternalStore(subscribeToFlags, getFlags, getFlags)
}
