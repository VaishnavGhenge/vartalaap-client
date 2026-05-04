'use client'

import { useState } from 'react'
import { X, Settings, FlaskConical } from 'lucide-react'
import { getFlags, setFlag, type FeatureFlags } from '@/src/lib/feature-flags'
import { usePeerStore } from '@/src/stores/peer'

interface BetaFeature {
  key: keyof FeatureFlags
  label: string
  description: string
  onToggle?: (enabled: boolean) => void
}

function useBetaFeatures(): BetaFeature[] {
  const setBackgroundBlur = usePeerStore((s) => s.setBackgroundBlur)
  return [
    {
      key: 'background_blur',
      label: 'Background Blur',
      description: 'Blurs your background using MediaPipe AI — runs entirely in-browser. Applied automatically when your camera is on.',
      onToggle: (enabled) => { void setBackgroundBlur(enabled) },
    },
    {
      key: 'experimental_echo_cancel',
      label: 'Enhanced Echo Cancellation',
      description: 'Activates Chrome-specific AEC3 and high-pass filter hints. Re-enable your mic after toggling for it to take effect.',
    },
  ]
}

interface SettingsPanelProps {
  onClose: () => void
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const betaFeatures = useBetaFeatures()
  return (
    <>
      <div
        aria-hidden="true"
        className="fixed inset-0 z-30 bg-black/30 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-label="Settings"
        className="fixed inset-x-0 bottom-0 z-40 flex flex-col rounded-t-2xl
                   bg-[hsl(var(--surface)/0.97)] border-t border-[hsl(var(--border))]
                   backdrop-blur-xl shadow-2xl"
        style={{ maxHeight: '75dvh' }}
      >
        <div className="flex items-center justify-between px-5 py-4 shrink-0
                        border-b border-[hsl(var(--border)/0.5)]">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-[hsl(var(--primary))]" aria-hidden="true" />
            <span className="text-sm font-semibold">Settings</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="ctrl-btn ctrl-btn-on w-7 h-7"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-y-auto overscroll-contain px-5 py-4 flex flex-col gap-2">
          <div className="flex items-center gap-2 mb-1">
            <FlaskConical className="w-3.5 h-3.5 text-amber-500" aria-hidden="true" />
            <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-widest">
              Beta Features
            </span>
          </div>

          {betaFeatures.map(({ key, label, description, onToggle }) => (
            <FeatureRow key={key} featureKey={key} label={label} description={description} onToggle={onToggle} />
          ))}
        </div>
      </div>
    </>
  )
}

function FeatureRow({
  featureKey,
  label,
  description,
  onToggle,
}: {
  featureKey: keyof FeatureFlags
  label: string
  description: string
  onToggle?: (enabled: boolean) => void
}) {
  const [enabled, setEnabled] = useState(() => getFlags()[featureKey])

  const toggle = () => {
    const next = !enabled
    setEnabled(next)
    setFlag(featureKey, next)
    onToggle?.(next)
  }

  return (
    <div className="flex items-start justify-between gap-4 rounded-xl
                    px-4 py-3.5 bg-[hsl(var(--surface-2))]/60
                    border border-[hsl(var(--border)/0.4)]
                    hover:bg-[hsl(var(--surface-2))] transition-colors">
      <div className="flex flex-col gap-1 min-w-0">
        <span className="text-sm font-medium leading-tight">{label}</span>
        <span className="text-xs text-[hsl(var(--muted-foreground))] leading-relaxed">
          {description}
        </span>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={`${enabled ? 'Disable' : 'Enable'} ${label}`}
        onClick={toggle}
        className={`relative mt-0.5 shrink-0 inline-flex h-5 w-9 items-center rounded-full
                    transition-colors focus-visible:outline-none
                    focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]/50
                    ${enabled ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--border))]'}`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm
                      transition-transform duration-200
                      ${enabled ? 'translate-x-[18px]' : 'translate-x-[3px]'}`}
        />
      </button>
    </div>
  )
}
