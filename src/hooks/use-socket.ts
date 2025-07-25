import { useEffect, useState } from 'react'
import { Socket } from 'socket.io-client'
import { socketService } from '@/services/socket/socket'

export const useSocket = () => {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    const connectSocket = async () => {
      try {
        const socketInstance = await socketService.connect()
        setSocket(socketInstance)
        setIsConnected(true)
      } catch (error) {
        console.error('Failed to connect to socket:', error)
        setIsConnected(false)
      }
    }

    connectSocket()

    return () => {
      socketService.disconnect()
      setSocket(null)
      setIsConnected(false)
    }
  }, [])

  return { socket, isConnected }
}