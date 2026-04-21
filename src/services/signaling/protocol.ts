export type MsgType =
  | 'welcome'
  | 'join'
  | 'joined'
  | 'leave'
  | 'peer-joined'
  | 'peer-left'
  | 'signal'
  | 'error'

export interface Envelope<T = unknown> {
  type: MsgType
  room?: string
  from?: string
  to?: string
  data?: T
}

export interface JoinedData { peers: string[] }
export interface PeerEventData { peerId: string }
export interface ErrorData { message: string }
