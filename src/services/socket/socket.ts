import { io, Socket } from 'socket.io-client'

class SocketService {
  private socket: Socket | null = null
  private url: string

  constructor(url: string) {
    this.url = url
  }

  connect(): Promise<Socket> {
    return new Promise((resolve, reject) => {
      this.socket = io(this.url, {
        transports: ['websocket'],
        autoConnect: false,
      })

      this.socket.on('connect', () => {
        console.log('Connected to socket server')
        resolve(this.socket!)
      })

      this.socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error)
        reject(error)
      })

      this.socket.connect()
    })
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
    }
  }

  getSocket(): Socket | null {
    return this.socket
  }

  emit(event: string, data?: any) {
    if (this.socket) {
      this.socket.emit(event, data)
    }
  }

  on(event: string, callback: (...args: any[]) => void) {
    if (this.socket) {
      this.socket.on(event, callback)
    }
  }

  off(event: string, callback?: (...args: any[]) => void) {
    if (this.socket) {
      this.socket.off(event, callback)
    }
  }
}

export const socketService = new SocketService(
  process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001'
)