import { IUserPreferences } from "./types";

const setMeetPreferences = (preferences: IUserPreferences): void => {
    localStorage.setItem("meetPreferences", JSON.stringify({ ...preferences }));
};

const getMeetPreferences = (): IUserPreferences => {
    const storedPreferencesString =
        localStorage.getItem("meetPreferences") || null;
    const meetPreferences = storedPreferencesString
        ? JSON.parse(storedPreferencesString)
        : ({ micStatus: true, cameraStatus: true } as IUserPreferences);
    return meetPreferences;
};

const getIsMeetJoinned = (): boolean => {
    const storedIsMeetJoined = localStorage.getItem("isMeetJoined") || null;
    return storedIsMeetJoined === "true" ? true : false;
}

const setIsMeetJoined = (isMeetJoined: boolean) => {
    localStorage.setItem("isMeetJoined", String(isMeetJoined))
}

const exports = { setMeetPreferences, getMeetPreferences, getIsMeetJoinned, setIsMeetJoined };

export default exports;
