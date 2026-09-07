const fs = require('node:fs')

function percentile(values, fraction) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
  return sorted.length ? Math.round(sorted[Math.ceil(sorted.length * fraction) - 1] * 100) / 100 : null
}

function results(suite) {
  return [
    ...(suite.specs ?? []).flatMap(spec => spec.tests.flatMap(test => test.results)),
    ...(suite.suites ?? []).flatMap(results),
  ]
}

for (const path of process.argv.slice(2)) {
  const file = JSON.parse(fs.readFileSync(path, 'utf8'))
  for (const result of (file.suites ?? []).flatMap(results)) {
    const attachment = result.attachments.find(item => item.name === 'capacity-report')
    if (!attachment) continue
    const report = JSON.parse(attachment.body ? Buffer.from(attachment.body, 'base64').toString() : fs.readFileSync(attachment.path, 'utf8'))
    const metrics = report.clientMetrics ?? []
    const media = metrics.filter(metric => metric.data.name === 'time_to_first_media')
    const phases = metrics.filter(metric => metric.data.name === 'call_setup_phase')
    const streams = report.observations.flatMap(item => item.inbound?.flat() ?? [])
    const audio = streams.filter(stream => stream.kind === 'audio')
    const video = streams.filter(stream => stream.kind === 'video')
    const cpuSamples = report.observations.filter(item => item.cpuTimes)
    const totals = sample => sample.cpuTimes.reduce((acc, cpu) => ({ idle: acc.idle + cpu.idle, total: acc.total + Object.values(cpu).reduce((a, b) => a + b, 0) }), { idle: 0, total: 0 })
    const first = cpuSamples.length ? totals(cpuSamples[0]) : null
    const last = cpuSamples.length ? totals(cpuSamples.at(-1)) : null
    console.log(JSON.stringify({
      source: path, status: result.status, participants: report.participantCount,
      started: report.started, ended: report.ended,
      firstMedia: media.map(metric => ({ participant: metric.participant, seconds: metric.data.value })),
      firstMediaP95Seconds: percentile(media.map(metric => metric.data.value), .95),
      setupPhases: phases.map(metric => ({ participant: metric.participant, ...metric.data })),
      audioJitterP95Ms: percentile(audio.map(stream => stream.jitterMs), .95),
      videoJitterP95Ms: percentile(video.map(stream => stream.jitterMs), .95),
      audioSamples: audio.length, videoSamples: video.length,
      hostCpuBusyPercent: first && last && last.total > first.total ? 100 * (1 - (last.idle - first.idle) / (last.total - first.total)) : null,
      logicalCpuCount: cpuSamples[0]?.cpuTimes.length,
      hostLoad: report.observations.map(item => ({ label: item.label, load: item.loadavg, freeMemoryBytes: item.freeMemoryBytes })),
      sfuHttpP95Ms: percentile(report.requests.map(item => item.durationMs), .95),
      sfuHttpFailures: report.sfuHttpFailures,
      checkpoints: report.observations.map(item => ({ label: item.label, counts: item.counts })),
    }, null, 2))
  }
}
