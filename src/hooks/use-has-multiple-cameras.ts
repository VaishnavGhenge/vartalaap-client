import { useEffect, useState } from 'react'

export function useHasMultipleCameras(): boolean {
  const [hasMultiple, setHasMultiple] = useState(false)

  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) return
    navigator.mediaDevices.enumerateDevices().then((devices) => {
      const videoInputs = devices.filter(d => d.kind === 'videoinput')
      setHasMultiple(videoInputs.length >= 2)
    }).catch(() => {})
  }, [])

  return hasMultiple
}
