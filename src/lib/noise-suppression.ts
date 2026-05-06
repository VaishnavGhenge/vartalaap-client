// Adopted from https://github.com/jitsi/jitsi-meet/tree/master/react/features/stream-effects/noise-suppression
// and https://github.com/cloudflare/meet/blob/main/app/utils/noiseSuppression.ts
//
// AudioWorklet pipeline: MediaStream → AudioWorkletNode (RNNoise WASM) → MediaStreamAudioDestinationNode
// The worklet bundle at /noise/noise-suppressor-worklet.esm.js embeds the RNNoise WASM binary.

const WORKLET_URL = '/noise/noise-suppressor-worklet.esm.js'
const WORKLET_NAME = 'NoiseSuppressorWorklet'

export class NoiseSuppressor {
  private _audioContext?: AudioContext
  private _audioSource?: MediaStreamAudioSourceNode
  private _audioDestination?: MediaStreamAudioDestinationNode
  private _workletNode?: AudioWorkletNode
  private _originalTrack?: MediaStreamTrack
  private _outputTrack?: MediaStreamTrack

  async start(inputTrack: MediaStreamTrack): Promise<MediaStreamTrack> {
    this._audioContext = new AudioContext()
    this._originalTrack = inputTrack

    const inputStream = new MediaStream([inputTrack])
    this._audioSource = this._audioContext.createMediaStreamSource(inputStream)
    this._audioDestination = this._audioContext.createMediaStreamDestination()
    this._outputTrack = this._audioDestination.stream.getAudioTracks()[0]

    // Sync muted state: output carries the mute signal, original is kept enabled
    // so the AudioContext receives audio to process at all times.
    this._outputTrack.enabled = inputTrack.enabled
    inputTrack.enabled = true

    await this._audioContext.audioWorklet.addModule(WORKLET_URL)

    if (this._audioContext.state === 'closed') {
      throw new Error('AudioContext closed before worklet could start')
    }

    this._workletNode = new AudioWorkletNode(this._audioContext, WORKLET_NAME)
    this._audioSource.connect(this._workletNode).connect(this._audioDestination)

    return this._outputTrack
  }

  stop(): void {
    // Restore original track muted state from output before tearing down.
    if (this._originalTrack && this._outputTrack) {
      this._originalTrack.enabled = this._outputTrack.enabled
    }

    // Close the worklet port explicitly — works around a Chromium bug where
    // AudioWorklets are not properly garbage collected otherwise.
    // https://bugs.chromium.org/p/chromium/issues/detail?id=1298955
    this._workletNode?.port?.close()
    this._audioSource?.disconnect()
    this._workletNode?.disconnect()
    this._audioDestination?.disconnect()
    this._audioContext?.close()

    this._audioContext = undefined
    this._audioSource = undefined
    this._audioDestination = undefined
    this._workletNode = undefined
    this._originalTrack = undefined
    this._outputTrack = undefined
  }
}
