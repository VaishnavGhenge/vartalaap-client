import { atom } from "recoil";

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