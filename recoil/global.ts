import {atom} from "recoil";
import { IPeer } from "@/utils/types";

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

export const joinedPeers = atom<string[]>({
    key: "joinedPeers",
    default: [],
});