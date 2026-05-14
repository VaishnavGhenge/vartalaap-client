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
  | 'stats-report'

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
  screenSharing?: boolean
}

export interface JoinData {
  name: string
  audio: boolean
  video: boolean
  presenceId?: string
}

export interface JoinedData { peers: PeerInfo[] }
export interface PeerJoinedData { peerId: string; name: string; audio: boolean; video: boolean; screenSharing?: boolean }
export interface PeerLeftData { peerId: string }
export interface PeerStateData { audio: boolean; video: boolean; speaking?: boolean; screenSharing?: boolean }
export interface ErrorData { message: string }

export interface StatsReportPeer {
  peerId: string
  quality: 'good' | 'medium' | 'poor' | 'unknown'
  networkPressure: 'low' | 'medium' | 'high' | 'severe' | 'unknown'
  roundTripTimeMs: number
  packetLossPercent: number
  outboundBitrateKbps: number
  inboundBitrateKbps: number
  candidateType: 'host' | 'srflx' | 'relay' | 'unknown'
  jitterMs: number
  encodingLevel: 0 | 1 | 2
  videoHeld: boolean
  frameWidth?: number
  frameHeight?: number
  framesPerSecond?: number
}

export interface StatsReportData {
  peers: StatsReportPeer[]
}
