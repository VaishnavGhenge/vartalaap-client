function removeAllTracks(stream: MediaStream, tracks: MediaStreamTrack[]) {
    tracks.forEach((track) => {
        track.stop();
        stream?.removeTrack(track);
    });
}

export function releaseMediaStream(stream: MediaStream) {
    if (stream) {
        if (stream) {
            const tracks = stream.getTracks();
            removeAllTracks(stream, tracks);
        }
    }
}

export function releaseVideoTracks(stream: MediaStream) {
    if (stream) {
        const videoTracks = stream.getVideoTracks();
        removeAllTracks(stream, videoTracks);
    }
}

export function releaseAudioTracks(stream: MediaStream) {
    if (stream) {
        const audioTracks = stream.getAudioTracks();
        removeAllTracks(stream, audioTracks);
    }
}
