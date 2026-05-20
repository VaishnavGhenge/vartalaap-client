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
  | 'sfu-tracks'
  | 'client-metric'
  | 'knock'
  | 'knock-request'
  | 'knock-admit'
  | 'knock-granted'

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
  videoHeld?: boolean
}

export interface JoinData {
  name: string
  audio: boolean
  video: boolean
  presenceId?: string
  needsAdmit?: boolean
}

export interface JoinedData { peers: PeerInfo[] }
export interface PeerJoinedData { peerId: string; name: string; audio: boolean; video: boolean; screenSharing?: boolean; videoHeld?: boolean }
export interface PeerLeftData { peerId: string }
export interface PeerStateData { audio: boolean; video: boolean; speaking?: boolean; screenSharing?: boolean; videoHeld?: boolean }
export interface ErrorData { message: string; code?: string }

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

// One observation emitted from the browser into a server-side Prometheus
// histogram. The server is the sole owner of the histogram registry — the
// browser only sends values. See vartalaap-server/internal/signaling/client.go
// for the supported (name, phase, result) combinations.
export type ClientMetricName = 'time_to_first_media' | 'call_setup_phase' | 'call_attempt'
export type CallSetupPhase    = 'ice_gather' | 'pub_connected' | 'sub_connected' | 'first_media'
export type CallAttemptResult = 'success' | 'timeout' | 'error' | 'abandoned'

export interface ClientMetricData {
  name: ClientMetricName
  // Seconds. For 'call_attempt' this is unused but must be a finite number.
  value: number
  phase?: CallSetupPhase
  result?: CallAttemptResult
}

export interface SfuTrackInfo {
  trackName: string
  mid?: string
}

export interface SfuTracksData {
  sessionId: string
  tracks: SfuTrackInfo[]
}

export interface KnockRequestData { peerId: string; name: string }
export interface KnockAdmitData { peerId: string }
export interface KnockGrantedData { sfuToken: string }
