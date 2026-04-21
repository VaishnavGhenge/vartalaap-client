import { useEffect, useRef, useState } from 'react'
import { SignalingClient } from '@/src/services/signaling/client'
import { wsServerUri } from '@/src/services/api/config'

export function useSignaling() {
  const ref = useRef<SignalingClient | null>(null)
  const [peerId, setPeerId] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const client = new SignalingClient(wsServerUri)
    ref.current = client
    let disposed = false
    ;(async () => {
      try {
        const id = await client.connect()
        if (disposed) { client.disconnect(); return }
        setPeerId(id)
        setConnected(true)
      } catch (e) {
        console.error('signaling connect failed', e)
      }
    })()
    return () => {
      disposed = true
      client.disconnect()
      ref.current = null
    }
  }, [])

  return { client: ref.current, peerId, connected }
}
