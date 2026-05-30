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
export type ClientMetricName = 'time_to_first_media' | 'call_setup_phase' | 'call_attempt' | 'call_setup_failure'
export type CallSetupPhase    = 'ice_gather' | 'pub_connected' | 'sub_connected' | 'first_media'
export type CallAttemptResult = 'success' | 'timeout' | 'error' | 'abandoned'

// Why a call-setup timeout happened, for the server-side errors-by-type
// breakdown (vartalaap_call_setup_failures_total{reason}). Each value names a
// distinct broken link in the host-publishes → sfu-tracks → subscribe → pull
// chain. The set is whitelisted on the server (client.go observeClientMetric);
// adding a value here means adding it there too.
export type CallFailureReason =
  | 'no_tracks_announced'           // peer is publishing but no sfu-tracks reached us (server broadcast gap)
  | 'tracks_announced_not_pulled'   // announced + pulled, CF never forwarded media (dead pull)
  | 'pull_errored'                  // the SFU pull errored (SDP/ICE/CF 4xx)
  | 'peers_present_none_publishing' // peers here but none advertise media (benign muted room)
  | 'unknown'

export interface ClientMetricData {
  name: ClientMetricName
  // Seconds. For 'call_attempt' and 'call_setup_failure' this is unused but must
  // be a finite number.
  value: number
  phase?: CallSetupPhase
  result?: CallAttemptResult
  reason?: CallFailureReason
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
