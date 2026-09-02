import { useEffect, useState } from 'react'
import { SignalingClient } from '@/src/services/signaling/client'
import type { ConnState } from '@/src/services/signaling/client'
import { wsServerUri } from '@/src/services/api/config'

export function useSignaling(enabled = true) {
  const [client, setClient] = useState<SignalingClient | null>(null)
  const [connState, setConnState] = useState<ConnState>('connecting')
  const [reconnectAttempt, setReconnectAttempt] = useState(0)

  useEffect(() => {
    if (!enabled) {
      setClient(null)
      setConnState('connecting')
      setReconnectAttempt(0)
      return
    }

    const c = new SignalingClient(wsServerUri)

    c.onStateChange = (state, attempt) => {
      setConnState(state)
      setReconnectAttempt(attempt)
      // The client survives its own reconnect, so it must stay the same object
      // across a blip. Nulling it on every non-connected state made useCall's
      // effect tear the call down instead: local media stopped, the room token
      // cleared (so a guest had to be admitted again), and the reconnect
      // handler deregistered before it could ever fire. The camera then looked
      // on while nothing was published.
      if (state === 'connected') setClient(c)
      else if (state === 'failed') setClient(null)
    }

    c.connect()

    return () => {
      c.onStateChange = undefined
      c.onReconnected = undefined
      c.dispose()
    }
  }, [enabled])

  return { client, connState, reconnectAttempt }
}
