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

export function videoDimensionReducer(state: {width: number, height: number}, action: {type: "width" | "height", value: number}) {
    const aspectRatio = 16 / 9;

    if (action.type === "width") {
        // Calculate new height based on the desired aspect ratio (e.g., 16:9)
        const newHeight = Math.round(action.value / aspectRatio);

        console.log(newHeight)

        // Return the updated state with the new width and height
        return { width: action.value, height: newHeight };
    } else if (action.type === "height") {
        // Calculate new width based on the desired aspect ratio (e.g., 16:9)
        const newWidth = Math.round(action.value / aspectRatio);

        // If the action is related to height, update the height directly
        return { width: newWidth, height: action.value };
    }
}