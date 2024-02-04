function removeAllTracks(stream: MediaStream, tracks: MediaStreamTrack[]) {
    tracks.forEach((track) => {
        track.stop();
        stream?.removeTrack(track);
    });
}

export function releaseMediaStream(stream: MediaStream | null) {
    if (stream) {
        const tracks = stream.getTracks();

        tracks.forEach((track) => {
            stream?.removeTrack(track);
        });
    }
}

export function releaseVideoTracks(videoRefCurrent: HTMLVideoElement | null) {
    if (videoRefCurrent) {
        const stream = videoRefCurrent.srcObject as MediaStream;

        if (stream) {
            const videoTracks = stream.getVideoTracks();
            removeAllTracks(stream, videoTracks);
        }
    }
}

export function releaseAudioTracks(stream: MediaStream | null) {
    if (stream) {
        const audioTracks = stream.getAudioTracks();
        removeAllTracks(stream, audioTracks);
    }
}

export function initializeStreamWithTracks(
    videoRefCurrent: HTMLVideoElement | null,
    tracks: MediaStreamTrack[]
) {
    if (videoRefCurrent) {
        let stream: MediaStream;

        if (videoRefCurrent.srcObject) {
            stream = videoRefCurrent.srcObject as MediaStream;
        } else {
            stream = new MediaStream();
            videoRefCurrent.srcObject = stream;
            streamMap.set(stream.id, stream);
        }

        tracks.forEach((track) => {
            stream.addTrack(track);
        });
    } else {
        console.error("VideRef current not initialized yet");
    }
}

export const streamMap = new Map<any, any>();

export function printMap() {
    streamMap.forEach(entry => {
        console.log(entry.getTracks());
    })
}