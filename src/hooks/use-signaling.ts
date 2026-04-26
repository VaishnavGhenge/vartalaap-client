import { useEffect, useState } from 'react'
import { SignalingClient } from '@/src/services/signaling/client'
import { wsServerUri } from '@/src/services/api/config'

export function useSignaling() {
  const [client, setClient] = useState<SignalingClient | null>(null)
  const [peerId, setPeerId] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const c = new SignalingClient(wsServerUri)
    let disposed = false
    ;(async () => {
      try {
        const id = await c.connect()
        if (disposed) { c.disconnect(); return }
        setClient(c)
        setPeerId(id)
        setConnected(true)
      } catch (e) {
        if (!disposed) console.error('signaling connect failed', e)
      }
    })()
    return () => {
      disposed = true
      c.disconnect()
      setClient(null)
      setConnected(false)
    }
  }, [])

  return { client, peerId, connected }
}
