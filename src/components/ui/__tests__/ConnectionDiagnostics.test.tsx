import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { ConnectionDiagnostics } from '../ConnectionDiagnostics'
import { usePeerStore, type PeerStats } from '@/src/stores/peer'

function makeStats(over: Partial<PeerStats> = {}): PeerStats {
  return {
    outboundBitrateKbps: 800,
    inboundBitrateKbps: 640,
    packetLossPercent: 0.4,
    roundTripTimeMs: 48,
    jitterMs: 6,
    candidateType: 'srflx',
    quality: 'good',
    networkPressure: 'low',
    encodingLevel: 2,
    videoHeld: false,
    timestamp: 1_000_000,
    frameWidth: 960,
    frameHeight: 540,
    framesPerSecond: 24,
    ...over,
  }
}

function seed(opts: {
  peers?: Array<{ id: string; name: string; stats?: PeerStats }>
  local?: boolean
} = {}) {
  const store = usePeerStore.getState()
  store.clearAll()
  for (const p of opts.peers ?? []) {
    usePeerStore.getState().addPeerConnection(p.id, { name: p.name, audio: true, video: true })
    if (p.stats) usePeerStore.getState().updatePeerStats(p.id, p.stats)
  }
  if (opts.local) {
    usePeerStore.getState().updateLocalStats({
      outboundBitrateKbps: 900,
      roundTripTimeMs: 52,
      candidateType: 'relay',
      timestamp: 1_000_000,
    })
  }
}

describe('ConnectionDiagnostics', () => {
  beforeEach(() => {
    usePeerStore.getState().clearAll()
  })

  it('says it is still measuring rather than showing a fake zero', () => {
    seed()
    render(<ConnectionDiagnostics />)
    expect(screen.getByText(/Measuring\./)).toBeTruthy()
    expect(screen.getByText(/No one else is here yet/)).toBeTruthy()
  })

  it('reports the uplink once, not per peer', () => {
    // Under the SFU there is ONE upstream to the edge shared by every remote
    // peer. Repeating it under each participant would read as per-peer data
    // and be wrong.
    seed({
      local: true,
      peers: [
        { id: 'peer-a', name: 'Alice', stats: makeStats() },
        { id: 'peer-b', name: 'Bob', stats: makeStats() },
      ],
    })
    render(<ConnectionDiagnostics />)
    expect(screen.getAllByText('Sending')).toHaveLength(1)
    // Each peer contributes its own receive figure.
    expect(screen.getAllByText('Receiving')).toHaveLength(2)
  })

  it('shows the route so a relayed call is visible', () => {
    seed({ local: true, peers: [{ id: 'peer-a', name: 'Alice', stats: makeStats({ candidateType: 'relay' }) }] })
    render(<ConnectionDiagnostics />)
    expect(screen.getAllByText('Relayed').length).toBeGreaterThan(0)
    expect(screen.getAllByText('via TURN relay').length).toBeGreaterThan(0)
  })

  it('renders a peer that has no stats yet without breaking the others', () => {
    seed({
      peers: [
        { id: 'peer-a', name: 'Alice', stats: makeStats() },
        { id: 'peer-b', name: 'Bob' },
      ],
    })
    render(<ConnectionDiagnostics />)
    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.getByText('Bob')).toBeTruthy()
    expect(screen.getByText('Measuring')).toBeTruthy()
  })

  it('shows an em dash for latency that has not been measured', () => {
    // -1 means no succeeded candidate pair has reported an RTT. Rendering it
    // as 0ms would read as a perfect connection.
    seed({ peers: [{ id: 'peer-a', name: 'Alice', stats: makeStats({ roundTripTimeMs: -1 }) }] })
    render(<ConnectionDiagnostics />)
    expect(screen.getByText('—')).toBeTruthy()
  })

  it('lists interruptions newest first, attributed to the right side', () => {
    seed({ local: true, peers: [{ id: 'peer-a', name: 'Alice', stats: makeStats() }] })
    usePeerStore.getState().recordMediaFlowEvent({
      direction: 'subscribe', kind: 'video', outcome: 'stalled',
      durationMs: 6_000, peerId: 'peer-a', peerName: 'Alice',
    })
    usePeerStore.getState().recordMediaFlowEvent({
      direction: 'publish', kind: 'audio', outcome: 'recovered', durationMs: 3_400,
    })
    render(<ConnectionDiagnostics />)

    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0].textContent).toContain('Your audio resumed after 3.4s')
    expect(items[1].textContent).toContain('Alice video stopped')
  })

  it('hides the interruption list when nothing has been interrupted', () => {
    seed({ local: true, peers: [{ id: 'peer-a', name: 'Alice', stats: makeStats() }] })
    render(<ConnectionDiagnostics />)
    expect(screen.queryByText('Recent interruptions')).toBeNull()
  })
})

describe('media flow event history', () => {
  beforeEach(() => {
    usePeerStore.getState().clearAll()
  })

  it('is bounded so a long flaky call cannot grow it without limit', () => {
    for (let i = 0; i < 30; i++) {
      usePeerStore.getState().recordMediaFlowEvent({
        direction: 'publish', kind: 'video', outcome: 'stalled', durationMs: 6_000,
      })
    }
    const events = usePeerStore.getState().mediaFlowEvents
    expect(events).toHaveLength(20)
    // Newest first, and ids keep increasing so React keys stay stable.
    expect(events[0].id).toBeGreaterThan(events[1].id)
  })

  it('is cleared when the call ends', () => {
    usePeerStore.getState().recordMediaFlowEvent({
      direction: 'publish', kind: 'audio', outcome: 'stalled', durationMs: 6_000,
    })
    usePeerStore.getState().updateLocalStats({
      outboundBitrateKbps: 1, roundTripTimeMs: 1, candidateType: 'host', timestamp: 1,
    })
    usePeerStore.getState().clearAll()
    expect(usePeerStore.getState().mediaFlowEvents).toEqual([])
    expect(usePeerStore.getState().localStats).toBeNull()
  })
})
