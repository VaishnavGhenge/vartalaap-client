import { atom } from "recoil";
import { IPeer } from "./types";

export const isMeetJoined = atom({
    key: "isMeetJoined",
    default: false,
});

export const userPreferences = atom({
    key: "userPreferences",
    default: {
        cameraStatus: true,
        micStatus: true,
    }
})

export const currentPeer = atom<IPeer>({
    key: "peerState",
    default: {
        peerId: null,
        name: "Vaishnav",
        owner: false,
    }
});