export type MsgType =
  | 'welcome'
  | 'join'
  | 'joined'
  | 'leave'
  | 'peer-joined'
  | 'peer-left'
  | 'peer-state'
  | 'signal'
  | 'error'
  | 'ping'
  | 'pong'

export interface Envelope<T = unknown> {
  type: MsgType
  room?: string
  from?: string
  to?: string
  data?: T
}

export interface PeerInfo {
  id: string
  name: string
  audio: boolean
  video: boolean
}

export interface JoinData {
  name: string
  audio: boolean
  video: boolean
}

export interface JoinedData { peers: PeerInfo[] }
export interface PeerJoinedData { peerId: string; name: string; audio: boolean; video: boolean }
export interface PeerLeftData { peerId: string }
export interface PeerStateData { audio: boolean; video: boolean; speaking?: boolean }
export interface ErrorData { message: string }
