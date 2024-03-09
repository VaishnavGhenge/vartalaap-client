import {atom, RecoilState} from "recoil";
import { IPeer } from "@/utils/types";

export const isBackendLive: RecoilState<boolean> = atom({
    key: "isBackendLive",
    default: false,
});

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
});

export const currentPeer = atom<IPeer>({
    key: "peerState",
    default: {
        sessionId: null,
        name: "Vaishnav",
        owner: false,
    }
});