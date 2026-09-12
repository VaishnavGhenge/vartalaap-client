export function observeMediaTrackInterruption(
  track: MediaStreamTrack,
  onInterrupted: () => void,
  muteGraceMs?: number,
): () => void {
  let muteTimer: ReturnType<typeof setTimeout> | null = null
  let reported = false
  const report = () => {
    if (reported) return
    reported = true
    onInterrupted()
  }
  const onEnded = () => report()
  const onMute = () => {
    if (muteGraceMs === undefined || muteTimer) return
    muteTimer = setTimeout(() => {
      muteTimer = null
      if (track.muted && track.readyState === 'live') report()
    }, muteGraceMs)
  }
  const onUnmute = () => {
    if (muteTimer) clearTimeout(muteTimer)
    muteTimer = null
  }

  track.addEventListener('ended', onEnded)
  if (muteGraceMs !== undefined) {
    track.addEventListener('mute', onMute)
    track.addEventListener('unmute', onUnmute)
  }
  return () => {
    if (muteTimer) clearTimeout(muteTimer)
    track.removeEventListener('ended', onEnded)
    track.removeEventListener('mute', onMute)
    track.removeEventListener('unmute', onUnmute)
  }
}
