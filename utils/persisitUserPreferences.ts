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

const exports = { setMeetPreferences, getMeetPreferences };

export default exports;
