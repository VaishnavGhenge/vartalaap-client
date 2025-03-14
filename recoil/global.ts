import {atom, RecoilState} from "recoil";
import {IPeer} from "@/utils/types";

export const backendOfflineStatus: RecoilState<boolean> = atom({
    key: "isBackendOffline",
    default: false
});

export const currentMeetCode: RecoilState<string> = atom({
    key: "meetCode",
    default: ""
});

export const isMeetJoined: RecoilState<boolean> = atom({
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