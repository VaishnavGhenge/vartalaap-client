export const audioStreamTrackMap = new Map<string, MediaStreamTrack>();
export const videoStreamTrackMap = new Map<string, MediaStreamTrack>();

export function releaseMediaStream(stream: MediaStream | null) {
    if (stream) {
        const tracks = stream.getTracks();

        tracks.forEach((track) => {
            stream?.removeTrack(track);
        });
    }
}

export function turnOffCamera() {
    videoStreamTrackMap.forEach((track) => {
        track.stop();
        videoStreamTrackMap.delete(track.id);
    });
}

export function turnOffMic() {
    audioStreamTrackMap.forEach((track) => {
        track.stop();
        audioStreamTrackMap.delete(track.id);
    });
}

export function getLocalVideoStreamTrack(): MediaStreamTrack | null {
    let firstTrack: MediaStreamTrack | null = null;

    videoStreamTrackMap.forEach((videoTrack) => {
        if(!firstTrack) {
            firstTrack = videoTrack;
        } else {
            videoTrack.stop();
            videoStreamTrackMap.delete(videoTrack.id);
        }
    });

    return firstTrack;
}