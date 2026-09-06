const { chromium } = require('@playwright/test')
const { readFileSync } = require('node:fs')
const ts = require('typescript')

async function main() {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })
  try {
    const page = await browser.newPage()
    const policy = ts.transpileModule(readFileSync('src/services/webrtc/video-quality.ts', 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText
    await page.addScriptTag({ content: `var exports = {};\n${policy}` })
    const results = await page.evaluate(async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
      const canvas = document.createElement('canvas')
      canvas.width = 960
      canvas.height = 540
      const ctx = canvas.getContext('2d')
      let frame = 0
      const draw = setInterval(() => {
        ctx.fillStyle = `hsl(${frame++ % 360} 80% 50%)`
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      }, 40)
      const video = canvas.captureStream(24).getVideoTracks()[0]
      const audioContext = new AudioContext()
      const oscillator = audioContext.createOscillator()
      const destination = audioContext.createMediaStreamDestination()
      oscillator.connect(destination)
      oscillator.start()
      await audioContext.resume()
      const audio = destination.stream.getAudioTracks()[0]
      const pub = new RTCPeerConnection({ iceServers: [] })
      const sub = new RTCPeerConnection({ iceServers: [] })
      pub.onicecandidate = ({ candidate }) => { if (candidate) sub.addIceCandidate(candidate) }
      sub.onicecandidate = ({ candidate }) => { if (candidate) pub.addIceCandidate(candidate) }
      const sender = pub.addTransceiver(video, {
        direction: 'sendonly', sendEncodings: [exports.videoEncoding({ encodingLevel: 2, videoHeld: false })],
      }).sender
      pub.addTrack(audio)
      try {
        await pub.setLocalDescription(await pub.createOffer())
        await sub.setRemoteDescription(pub.localDescription)
        await sub.setLocalDescription(await sub.createAnswer())
        await pub.setRemoteDescription(sub.localDescription)
        const deadline = Date.now() + 10_000
        while (pub.connectionState !== 'connected' && Date.now() < deadline) await wait(50)
        if (pub.connectionState !== 'connected') throw new Error('Loopback did not connect')
        const snapshot = async () => {
          const result = {}
          ;(await sub.getStats()).forEach((s) => {
            if (s.type === 'inbound-rtp') result[s.kind] = s
          })
          return result
        }
        const results = []
        for (const quality of [
          { encodingLevel: 2, videoHeld: false },
          { encodingLevel: 1, videoHeld: false },
          { encodingLevel: 0, videoHeld: false },
          { encodingLevel: 0, videoHeld: true },
          { encodingLevel: 0, videoHeld: false },
          { encodingLevel: 2, videoHeld: false },
        ]) {
          const parameters = sender.getParameters()
          parameters.encodings = parameters.encodings.map((e) => ({ ...e, ...exports.videoEncoding(quality) }))
          await sender.setParameters(parameters)
          await wait(800)
          const before = await snapshot()
          await wait(1_200)
          const after = await snapshot()
          if (!(after.audio.bytesReceived > before.audio.bytesReceived)) throw new Error('Audio stopped')
          const frames = after.video.framesDecoded - before.video.framesDecoded
          if (quality.videoHeld ? frames > 1 : frames < 1) throw new Error(`Unexpected video flow: ${JSON.stringify({ quality, frames })}`)
          if (!quality.videoHeld && after.video.frameWidth > 960 / exports.videoEncoding(quality).scaleResolutionDownBy) throw new Error('Video did not scale down')
          results.push({ ...quality, frames, width: after.video.frameWidth, audioFlowing: true })
        }
        return results
      } finally {
        clearInterval(draw)
        pub.close()
        sub.close()
        video.stop()
        audio.stop()
        oscillator.stop()
        await audioContext.close()
      }
    })
    console.log(JSON.stringify(results, null, 2))
  } finally {
    await browser.close()
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
