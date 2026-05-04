'use client'

import { useState, useEffect } from 'react'

export interface MediaDeviceSummary {
  deviceId: string
  label: string
}

export interface AvailableDevices {
  audioInputs: MediaDeviceSummary[]
  videoInputs: MediaDeviceSummary[]
  audioOutputs: MediaDeviceSummary[]
}

const EMPTY: AvailableDevices = { audioInputs: [], videoInputs: [], audioOutputs: [] }

function toSummary(d: MediaDeviceInfo, fallback: string): MediaDeviceSummary {
  return { deviceId: d.deviceId, label: d.label || fallback }
}

async function enumerate(): Promise<AvailableDevices> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return EMPTY
  try {
    const all = await navigator.mediaDevices.enumerateDevices()
    return {
      audioInputs: all.filter(d => d.kind === 'audioinput').map((d, i) => toSummary(d, `Microphone ${i + 1}`)),
      videoInputs: all.filter(d => d.kind === 'videoinput').map((d, i) => toSummary(d, `Camera ${i + 1}`)),
      audioOutputs: all.filter(d => d.kind === 'audiooutput').map((d, i) => toSummary(d, `Speaker ${i + 1}`)),
    }
  } catch { return EMPTY }
}

// Enumerates available media devices and re-enumerates on devicechange events.
// Labels are populated only after the user has granted mic/camera permission.
export function useMediaDevices(): AvailableDevices {
  const [devices, setDevices] = useState<AvailableDevices>(EMPTY)

  useEffect(() => {
    let cancelled = false

    const refresh = () => {
      enumerate().then(d => { if (!cancelled) setDevices(d) })
    }

    refresh()
    navigator.mediaDevices?.addEventListener('devicechange', refresh)
    return () => {
      cancelled = true
      navigator.mediaDevices?.removeEventListener('devicechange', refresh)
    }
  }, [])

  return devices
}
