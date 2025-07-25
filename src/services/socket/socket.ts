import io from 'socket.io-client'

class SocketClient {
  private socket: typeof io.Socket | null = null
  private readonly url: string

  constructor(url: string) {
    this.url = url
  }

  connect(): Promise<typeof io.Socket> {
    return new Promise((resolve, reject) => {
      this.socket = io(this.url, {
        transports: ['websocket'],
        autoConnect: false,
      })

      this.socket.on('connect', () => {
        console.log('Connected to socket server')
        resolve(this.socket!)
      })

      this.socket.on('connect_error', (error: any) => {
        console.error('SocketClient connection error:', error)
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

  getSocket(): typeof io.Socket | null {
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

export const socketClient = new SocketClient(
  process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:8080'
)