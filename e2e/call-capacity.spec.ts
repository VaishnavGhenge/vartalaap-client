import { loadavg, freemem, cpus } from 'node:os'
import { type Page, type BrowserContext } from '@playwright/test'
import { test, expect } from './fixtures'
import { createNCallContexts, createRoom, fillName } from './helpers/call'

async function joinWithMedia(page: Page, room: string) {
  await page.goto(`/room/${room}`, { waitUntil: 'domcontentloaded' })
  await fillName(page, 'Call lab')
  const camera = page.getByRole('button', { name: /turn camera on/i })
  if (await camera.isVisible()) await camera.click()
  await page.getByRole('button', { name: /join now/i }).click()
  await expect(page.getByRole('button', { name: /leave call/i })).toBeVisible({ timeout: 15_000 })
  const microphone = page.getByRole('button', { name: /^unmute/i })
  if (await microphone.isVisible()) await microphone.click()
}

async function inbound(page: Page) {
  return page.evaluate(async () => {
    const pcs = (window as unknown as { __pcs: Set<RTCPeerConnection> }).__pcs
    const samples: Array<{ id: string; kind: string; bytes: number; frames: number; energy: number; jitterMs: number; decodeSeconds: number; packetsLost: number }> = []
    let index = 0
    for (const pc of pcs) {
      const prefix = index++
      if (pc.connectionState === 'closed') continue
      const stats = await pc.getStats()
      stats.forEach((r) => {
        if (r.type === 'inbound-rtp') samples.push({
          id: `${prefix}:${r.id}`, kind: r.kind, bytes: r.bytesReceived ?? 0,
          frames: r.framesDecoded ?? 0, energy: r.totalAudioEnergy ?? 0,
          jitterMs: (r.jitter ?? 0) * 1000, decodeSeconds: r.totalDecodeTime ?? 0, packetsLost: r.packetsLost ?? 0,
        })
      })
    }
    return samples
  })
}

test('participants sustain all remote streams and recover after rejoin', async ({ browser }, testInfo) => {
  test.skip(process.env.E2E_CAPACITY !== 'true', 'Opt-in staging media load test')
  test.setTimeout(600_000)
  const participantCount = Number(process.env.E2E_PARTICIPANTS ?? 10)
  if (![2, 5, 10].includes(participantCount)) throw new Error('E2E_PARTICIPANTS must be 2, 5, or 10')
  const sharedRoom = process.env.E2E_SHARED_ROOM
  const expectedTotal = sharedRoom ? 10 : participantCount
  const rampCount = participantCount === 10 ? 8 : 2
  const observations: unknown[] = []
  const clientMetrics: unknown[] = []
  const requests: unknown[] = []
  const failures: Array<{ participant: number; status: number; path: string }> = []
  let contexts: BrowserContext[] = []
  const started = new Date().toISOString()
  try {
    const room = sharedRoom ?? await createRoom()
    contexts = await createNCallContexts(browser, participantCount)
    const pages = await Promise.all(contexts.map(context => context.newPage()))
    pages.forEach((page, participant) => page.on('response', response => {
      const path = new URL(response.url()).pathname
      if (response.status() >= 400 && path.startsWith('/sfu/')) failures.push({ participant, status: response.status(), path: path.replace(/[a-f0-9-]{20,}/gi, ':id') })
    }))
    pages.forEach((page, participant) => {
      page.on('websocket', socket => socket.on('framesent', ({ payload }) => {
        try {
          const message = JSON.parse(payload.toString())
          if (message.type === 'client-metric') clientMetrics.push({ participant, at: new Date().toISOString(), data: message.data })
        } catch {}
      }))
      page.on('requestfinished', request => {
        const path = new URL(request.url()).pathname
        if (path.startsWith('/sfu/')) {
          const timing = request.timing()
          requests.push({ participant, path: path.replace(/[a-f0-9-]{20,}/gi, ':id'), durationMs: timing.responseEnd, waitMs: timing.responseStart - timing.requestStart })
        }
      })
    })

    async function checkAll(label: string, active: Page[]) {
      const expected = sharedRoom ? expectedTotal : active.length
      await Promise.all(active.map(page => expect(page.getByText(`${expected} participant${expected === 1 ? '' : 's'}`, { exact: true })).toBeVisible({ timeout: sharedRoom ? 240_000 : 30_000 })))
      const deadline = Date.now() + 45_000
      let counts: Array<{ participant: number; video: number; audio: number }> = []
      do {
        const before = await Promise.all(active.map(inbound))
        await new Promise(resolve => setTimeout(resolve, 3000))
        const after = await Promise.all(active.map(inbound))
        counts = after.map((rows, participant) => {
          const previous = new Map(before[participant].map(row => [row.id, row]))
          const growing = rows.filter(row => {
            const prev = previous.get(row.id)
            return prev && row.bytes > prev.bytes && (row.kind === 'video' ? row.frames > prev.frames : row.energy > prev.energy)
          })
          return { participant, video: growing.filter(row => row.kind === 'video').length, audio: growing.filter(row => row.kind === 'audio').length }
        })
        if (counts.every(count => count.video >= expected - 1 && count.audio >= expected - 1)) break
      } while (Date.now() < deadline)
      observations.push({ label, at: new Date().toISOString(), loadavg: loadavg(), cpuTimes: cpus().map(cpu => cpu.times), freeMemoryBytes: freemem(), counts, inbound: await Promise.all(active.map(inbound)) })
      console.log(JSON.stringify({ label, counts }))
      for (const count of counts) {
        expect(count.video, `${label}: participant ${count.participant} flowing video streams`).toBeGreaterThanOrEqual(expected - 1)
        expect(count.audio, `${label}: participant ${count.participant} audible RTP streams`).toBeGreaterThanOrEqual(expected - 1)
      }
    }

    if (sharedRoom) {
      const sampleAt = Number(process.env.E2E_SAMPLE_AT)
      if (!Number.isFinite(sampleAt) || sampleAt < Date.now()) throw new Error('Shared runs require a future E2E_SAMPLE_AT epoch in milliseconds')
      for (const page of pages) await joinWithMedia(page, room)
      await new Promise(resolve => setTimeout(resolve, Math.max(0, sampleAt - Date.now())))
      for (let round = 0; round < 3; round++) {
        await checkAll(`distributed ${round + 1}`, pages)
        await new Promise(resolve => setTimeout(resolve, 15_000))
      }
      await new Promise(resolve => setTimeout(resolve, Math.max(0, sampleAt + 120_000 - Date.now())))
      return
    }
    await test.step('initial ramp', async () => {
      for (const page of pages.slice(0, rampCount)) await joinWithMedia(page, room)
      await checkAll(`${rampCount} participants`, pages.slice(0, rampCount))
    })
    await test.step('add two late joiners', async () => {
      for (const page of pages.slice(rampCount)) await joinWithMedia(page, room)
      await checkAll(`${participantCount} participants`, pages)
    })
    await test.step('sustain participants for one minute', async () => {
      for (let round = 0; round < 3; round++) {
        await new Promise(resolve => setTimeout(resolve, 20_000))
        await checkAll(`soak ${round + 1}`, pages)
      }
    })
    await test.step('last participant leaves and rejoins', async () => {
      await pages[participantCount - 1].getByRole('button', { name: /leave call/i }).click()
      await checkAll('after leave', pages.slice(0, participantCount - 1))
      await joinWithMedia(pages[participantCount - 1], room)
      await checkAll('after rejoin', pages)
    })
  } finally {
    await testInfo.attach('capacity-report', { body: JSON.stringify({ participantCount, started, ended: new Date().toISOString(), observations, clientMetrics, requests, sfuHttpFailures: failures }, null, 2), contentType: 'application/json' })
    if (sharedRoom) console.log('CAPACITY_REPORT ' + JSON.stringify({ participantCount, started, ended: new Date().toISOString(), observations, clientMetrics, requests, sfuHttpFailures: failures }))
    await Promise.all(contexts.map(context => context.close().catch(() => {})))
  }
})
