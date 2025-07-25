import {useEffect, useState} from 'react'
import {Socket} from 'socket.io-client'
import {socketClient} from "@/src/services/socket/socket";

export const useSocket = () => {
    const [socket, setSocket] = useState<typeof Socket | null>(null)
    const [isConnected, setIsConnected] = useState(false)

    useEffect(() => {
        const connectSocket = async () => {
            try {
                const socketInstance = await socketClient.connect()
                setSocket(socketInstance)
                setIsConnected(true)
            } catch (error) {
                console.error('Failed to connect to socket:', error)
                setIsConnected(false)
            }
        }

        void connectSocket()

        return () => {
            if (!socket) return;

            socket.disconnect()
            setSocket(null)
            setIsConnected(false)
        }
    }, [])

    return {socket, isConnected}
}