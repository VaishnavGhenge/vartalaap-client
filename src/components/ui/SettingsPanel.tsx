'use client'

import { useRef, useState } from 'react'
import { X, Plus, Check } from 'lucide-react'
import {
  getBackgroundEffectPreference,
  type BackgroundEffectMode,
  type BackgroundEffectPreference,
} from '@/src/lib/background-effects'
import { usePeerStore } from '@/src/stores/peer'
import { useMediaDevices } from '@/src/hooks/use-media-devices'
import { supportsAudioOutputSelection } from '@/src/lib/audio-context'
import { Toggle } from '@/src/components/ui/Toggle'

interface SettingsPanelProps {
  onClose: () => void
  isVideoOff?: boolean
}

// Abstract colorful gradient — used as the "background" in tile previews
function AbstractBg() {
  return (
    <div className="absolute inset-0 bg-[linear-gradient(135deg,#7c3aed_0%,#3b82f6_50%,#10b981_100%)]">
      <div className="absolute -right-2 -top-2 h-10 w-10 rounded-full bg-amber-300/50" />
      <div className="absolute -bottom-1 left-0 h-6 w-6 rounded-full bg-pink-300/40" />
    </div>
  )
}

function NonePreview() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <AbstractBg />
    </div>
  )
}

function BlurPreview({ px }: { px: number }) {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Expand beyond tile bounds so blur doesn't darken at edges, then clip */}
      <div className="absolute inset-[-30%]" style={{ filter: `blur(${px}px)` }}>
        <AbstractBg />
      </div>
    </div>
  )
}

interface TileProps {
  label: string
  selected: boolean
  onClick: () => void
  dashed?: boolean
  children: React.ReactNode
}

function Tile({ label, selected, onClick, dashed, children }: TileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className="group flex flex-col items-center gap-1.5 rounded-xl focus-visible:outline-none
                 focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]/60"
    >
      <div
        className={`relative h-[56px] w-[76px] overflow-hidden rounded-xl transition-all duration-150
                    ${dashed
                      ? 'border-2 border-dashed border-[hsl(var(--border))] bg-[hsl(var(--surface-2))]/40 group-hover:border-[hsl(var(--muted-foreground)/0.5)]'
                      : selected
                        ? 'ring-[3px] ring-[hsl(var(--primary))] ring-offset-2 ring-offset-[hsl(var(--surface))]'
                        : 'ring-1 ring-[hsl(var(--border)/0.4)] group-hover:ring-[hsl(var(--border))]'
                    }`}
      >
        {children}
        {selected && (
          <span className="absolute right-1 top-1 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-[hsl(var(--primary))] shadow">
            <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} aria-hidden />
          </span>
        )}
      </div>
      <span
        className={`text-[11px] leading-none transition-colors
                    ${selected
                      ? 'font-medium text-[hsl(var(--foreground))]'
                      : 'text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--foreground))]'
                    }`}
      >
        {label}
      </span>
    </button>
  )
}

const BLUR_LEVELS: [BackgroundEffectMode, string, number][] = [
  ['blur-subtle', 'Subtle', 4],
  ['blur-medium', 'Blur',   9],
  ['blur-strong', 'Strong', 15],
]

function BackgroundEffectsGrid({ onChange }: { onChange: (pref: BackgroundEffectPreference) => void }) {
  const [pref, setPref] = useState<BackgroundEffectPreference>(() => getBackgroundEffectPreference())
  const fileRef = useRef<HTMLInputElement>(null)
  const { mode, imageDataUrl } = pref

  const commit = (next: BackgroundEffectPreference) => { setPref(next); onChange(next) }

  // Keep imageDataUrl alive when switching to blur/none so the user can switch back
  // without re-uploading. Only revoke when a new image is uploaded.
  const selectNone = () =>
    commit({ mode: 'off', imageDataUrl: pref.imageDataUrl })

  const selectBlur = (m: BackgroundEffectMode) =>
    commit({ mode: m, imageDataUrl: pref.imageDataUrl })

  const selectImage = () => {
    if (imageDataUrl) commit({ mode: 'image', imageDataUrl })
  }

  const handleUpload = (file: File | undefined) => {
    if (!file?.type.startsWith('image/')) return
    const url = URL.createObjectURL(file)
    if (pref.imageDataUrl?.startsWith('blob:')) URL.revokeObjectURL(pref.imageDataUrl)
    commit({ mode: 'image', imageDataUrl: url })
  }

  return (
    <div className="flex flex-wrap gap-x-3 gap-y-4">
      <Tile label="None" selected={mode === 'off'} onClick={selectNone}>
        <NonePreview />
      </Tile>

      {BLUR_LEVELS.map(([m, label, px]) => (
        <Tile key={m} label={label} selected={mode === m} onClick={() => selectBlur(m)}>
          <BlurPreview px={px} />
        </Tile>
      ))}

      {/* Custom image tile — shown only when an image has been uploaded this session */}
      {imageDataUrl && (
        <Tile label="Custom" selected={mode === 'image'} onClick={selectImage}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageDataUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        </Tile>
      )}

      {/* Upload tile — always shown so user can add / replace a custom image */}
      <Tile
        label={imageDataUrl ? 'Replace' : 'Upload'}
        selected={false}
        onClick={() => fileRef.current?.click()}
        dashed
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <Plus className="h-5 w-5 text-[hsl(var(--muted-foreground))]" aria-hidden />
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => { handleUpload(e.target.files?.[0]); e.target.value = '' }}
        />
      </Tile>
    </div>
  )
}

interface DeviceRowProps {
  label: string
  devices: { deviceId: string; label: string }[]
  value: string
  onChange: (deviceId: string) => void
}

function DeviceRow({ label, devices, value, onChange }: DeviceRowProps) {
  if (devices.length === 0) return null
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-[hsl(var(--muted-foreground))]">{label}</span>
      <select
        value={value || devices[0]?.deviceId}
        onChange={(e) => onChange(e.target.value)}
        className="w-full cursor-pointer appearance-none rounded-lg border border-[hsl(var(--border))]
                   bg-[hsl(var(--surface-2))] px-3 py-2 text-sm text-[hsl(var(--foreground))]
                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))/0.6]"
      >
        {devices.map((d) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export function SettingsPanel({ onClose, isVideoOff }: SettingsPanelProps) {
  const setBackgroundEffect = usePeerStore((s) => s.setBackgroundEffect)
  const setAudioInput = usePeerStore((s) => s.setAudioInput)
  const setVideoInput = usePeerStore((s) => s.setVideoInput)
  const setAudioOutput = usePeerStore((s) => s.setAudioOutput)
  const preferredAudioInputId = usePeerStore((s) => s.preferredAudioInputId)
  const preferredVideoInputId = usePeerStore((s) => s.preferredVideoInputId)
  const preferredAudioOutputId = usePeerStore((s) => s.preferredAudioOutputId)
  const suppressNoise = usePeerStore((s) => s.suppressNoise)
  const setSuppressNoise = usePeerStore((s) => s.setSuppressNoise)
  const { audioInputs, videoInputs, audioOutputs } = useMediaDevices()
  const showSpeaker = supportsAudioOutputSelection() && audioOutputs.length > 0

  return (
    <aside
      role="dialog"
      aria-label="Settings"
      className="fixed inset-y-0 right-0 z-40 flex w-80 max-w-[90vw] flex-col border-l
                 border-[hsl(var(--border))] bg-[hsl(var(--surface)/0.98)] shadow-2xl backdrop-blur-xl"
    >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[hsl(var(--border)/0.5)] px-5 py-4">
          <span className="text-sm font-semibold">Settings</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="ctrl-btn ctrl-btn-on h-7 w-7"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-7 overflow-y-auto px-5 py-6">

          {/* ── Background ─────────────────────────────── */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-[hsl(var(--muted-foreground))]">
              Background
            </h2>
            {isVideoOff ? (
              <p className="rounded-xl border border-[hsl(var(--border)/0.4)] bg-[hsl(var(--surface-2))]/60
                            px-4 py-3 text-sm text-[hsl(var(--muted-foreground))]">
                Turn on your camera to use background effects.
              </p>
            ) : (
              <BackgroundEffectsGrid onChange={(pref) => { void setBackgroundEffect(pref) }} />
            )}
          </section>

          {/* ── Audio ──────────────────────────────────── */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-[hsl(var(--muted-foreground))]">
              Audio
            </h2>
            <Toggle
              id="noise-suppression"
              checked={suppressNoise}
              onChange={(v) => { void setSuppressNoise(v) }}
              label="Noise suppression"
              description="Remove background noise with RNNoise AI"
            />
          </section>

          {/* ── Devices ────────────────────────────────── */}
          {(audioInputs.length > 0 || videoInputs.length > 0 || showSpeaker) && (
            <section className="flex flex-col gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-[hsl(var(--muted-foreground))]">
                Devices
              </h2>
              <div className="flex flex-col gap-3">
                <DeviceRow
                  label="Microphone"
                  devices={audioInputs}
                  value={preferredAudioInputId}
                  onChange={(id) => { void setAudioInput(id) }}
                />
                <DeviceRow
                  label="Camera"
                  devices={videoInputs}
                  value={preferredVideoInputId}
                  onChange={(id) => { void setVideoInput(id) }}
                />
                {showSpeaker && (
                  <DeviceRow
                    label="Speaker"
                    devices={audioOutputs}
                    value={preferredAudioOutputId}
                    onChange={(id) => { void setAudioOutput(id) }}
                  />
                )}
              </div>
            </section>
          )}

        </div>
    </aside>
  )
}
