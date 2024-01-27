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

export function initializeStreamWithTracks(videoRefCurrent: HTMLVideoElement | null, tracks: MediaStreamTrack[]) {
    if (videoRefCurrent) {
        videoRefCurrent.srcObject = new MediaStream(tracks);

        // console.log(videoRefCurrent.srcObject.id + " initialized");
    }
};