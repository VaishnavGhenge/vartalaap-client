import { atom } from "recoil";

export const localVideoTrack = atom<MediaStreamTrack | null>({
    key: "localVideoTrack",
    default: null,
});

export const localAudioTrack = atom<MediaStreamTrack | null>({
    key: "localAudioTrack",
    default: null,
});