"use client";

import { useRecoilState } from "recoil";

import { isMeetJoined, userPreferences } from "@/utils/globalStates";
import JoinMeet from "@/components/meet/JoinMeet";
import MeetCall from "@/components/meet/MeetCall";
import { IUserPreferences } from "@/utils/types";

export default function Meet({ params }: { params: { meetCode: string } }) {
    const [isMeetJoinedState, setIsMeetJoinedState] = useRecoilState(isMeetJoined);
    const [userPreferencesState, setUserPreferences] = useRecoilState<IUserPreferences>(userPreferences);

    const updateUserPreferences = (preferences: {
        micStatus?: boolean;
        cameraStatus?: boolean;
    }) => {
        const updatedPreferences = {
            ...userPreferencesState,
            ...preferences,
        } as IUserPreferences;

        // console.log("newely formed preferences: ", updatedPreferences);
        setUserPreferences(updatedPreferences);
    };

    if (isMeetJoinedState) {
        return (
            <MeetCall
                meetCode={params.meetCode}
                userPreferences={userPreferencesState}
                updateUserPreferences={updateUserPreferences}
            />
        );
    } else {
        return (
            <JoinMeet
                meetCode={params.meetCode}
                userPreferences={userPreferencesState}
                updateUserPreferences={updateUserPreferences}
            />
        );
    }
}
