export type UserPreferences = {
    micStatus: boolean;
    cameraStatus: boolean;
}

const setMeetPreferences = (preferences: UserPreferences): void => {
    localStorage.setItem('meetPreferences', JSON.stringify({...preferences}));
}

const getMeetPreferences = (): UserPreferences => {
    const storedPreferencesString = localStorage.getItem('meetPreferences') || null;
    const meetPreferences = storedPreferencesString ? JSON.parse(storedPreferencesString) : {micStatus: true, cameraStatus: true} as UserPreferences
    return meetPreferences;
}

const exports = {setMeetPreferences, getMeetPreferences}

export default exports;