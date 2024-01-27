"use client";

import { useEffect, useState } from "react";
import { useRecoilState } from "recoil";

import { isMeetJoined } from "@/utils/globalStates";
import JoinMeet from "@/components/meet/JoinMeet";
import MeetCall from "@/components/meet/MeetCall";
import stored from "@/utils/persisitUserPreferences";
import { IUserPreferences } from "@/utils/types";

export default function Meet({ params }: { params: { meetCode: string } }) {
    const [isMeetJoinedState, setIsMeetJoinedState] = useRecoilState(isMeetJoined);
    const [userPreferences, setUserPreferences] = useState<IUserPreferences>({
        micStatus: false,
        cameraStatus: false,
    });

    useEffect(() => {
        const userPreferences = stored.getMeetPreferences();
        setUserPreferences(userPreferences);

        const isMeetJoined = stored.getIsMeetJoinned();
        setIsMeetJoinedState(isMeetJoined);

        console.log("user preferences restored: ", userPreferences);
    }, []);

    const updateUserPreferences = (preferences: {
        micStatus?: boolean;
        cameraStatus?: boolean;
    }) => {
        const updatedPreferences = {
            ...userPreferences,
            ...preferences,
        } as IUserPreferences;

        // console.log("newely formed preferences: ", updatedPreferences);

        stored.setMeetPreferences(updatedPreferences);
        setUserPreferences(updatedPreferences);
    };

    if (isMeetJoinedState) {
        return (
            <MeetCall
                meetCode={params.meetCode}
                userPreferences={userPreferences}
                updateUserPreferences={updateUserPreferences}
            />
        );
    } else {
        return (
            <JoinMeet
                meetCode={params.meetCode}
                userPreferences={userPreferences}
                updateUserPreferences={updateUserPreferences}
            />
        );
    }
}
