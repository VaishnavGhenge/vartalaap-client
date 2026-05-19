const KEY_MIC = 'sessionly_join_mic_on'
const KEY_CAM = 'sessionly_join_camera_on'

function read(key: string, fallback: boolean): boolean {
    if (typeof window === 'undefined') return fallback
    const v = localStorage.getItem(key)
    return v === null ? fallback : v === 'true'
}

function write(key: string, value: boolean) {
    if (typeof window === 'undefined') return
    localStorage.setItem(key, value ? 'true' : 'false')
}

export const callDefaults = {
    getMicOn:     () => read(KEY_MIC, false),
    getCameraOn:  () => read(KEY_CAM, false),
    setMicOn:     (v: boolean) => write(KEY_MIC, v),
    setCameraOn:  (v: boolean) => write(KEY_CAM, v),
}
