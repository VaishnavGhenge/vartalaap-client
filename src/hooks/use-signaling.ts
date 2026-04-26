import { useEffect, useState } from 'react'
import { SignalingClient } from '@/src/services/signaling/client'
import type { ConnState } from '@/src/services/signaling/client'
import { wsServerUri } from '@/src/services/api/config'

export function useSignaling() {
  const [client, setClient] = useState<SignalingClient | null>(null)
  const [connState, setConnState] = useState<ConnState>('connecting')
  const [reconnectAttempt, setReconnectAttempt] = useState(0)

  useEffect(() => {
    const c = new SignalingClient(wsServerUri)

    c.onStateChange = (state, attempt) => {
      setConnState(state)
      setReconnectAttempt(attempt)
      if (state === 'connected') setClient(c)
    }

    c.connect()

    return () => {
      c.onStateChange = undefined
      c.onReconnected = undefined
      c.dispose()
    }
  }, [])

  return { client, connState, reconnectAttempt }
}
