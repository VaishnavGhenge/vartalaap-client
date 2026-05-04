const STORAGE_KEY = 'vartalaap:devices'

interface DevicePrefs {
  audioInputId?: string
  videoInputId?: string
  audioOutputId?: string
}

export function getDevicePreferences(): DevicePrefs {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as DevicePrefs) : {}
  } catch { return {} }
}

export function setDevicePreference(
  key: keyof DevicePrefs,
  deviceId: string,
): void {
  if (typeof window === 'undefined') return
  try {
    const prefs = getDevicePreferences()
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...prefs, [key]: deviceId }))
  } catch { /* non-critical */ }
}
