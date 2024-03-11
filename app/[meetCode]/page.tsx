"use client";

import {useRecoilState} from "recoil";

import {isMeetJoined, userPreferences} from "@/recoil/global";
import JoinMeet from "@/components/meet/JoinMeet";
import MeetCall from "@/components/meet/MeetCall";
import {IUserPreferences} from "@/utils/types";
import {useEffect, useState} from "react";
import {Meet} from "@/webrtc/webrtc";

export default function MeetManager({params}: { params: { meetCode: string } }) {
    const [isMeetJoinedState, setIsMeetJoinedState] = useRecoilState(isMeetJoined);
    const [userPreferencesState, setUserPreferences] = useRecoilState<IUserPreferences>(userPreferences);
    const [meetState, setMeet] = useState<Meet | null>(null);

    const updateUserPreferences = (preferences: { micStatus?: boolean; cameraStatus?: boolean; }) => {
        const updatedPreferences = {
            ...userPreferencesState,
            ...preferences,
        } as IUserPreferences;

        setUserPreferences(updatedPreferences);
    };

    useEffect(() => {
        const meetId = window.sessionStorage.getItem("meetId");
        const sessionId = window.sessionStorage.getItem("sessionId");

        if (!meetId || !sessionId) {
            console.log("No meetId or sessionId available in sessionStorage while leaving meet");
            return;
        }

        const meet = Meet.getInstance(meetId, sessionId);
        setMeet(meet);

        return () => {
            meet.leaveMeet();
        }
    }, []);

    if (isMeetJoinedState) {
        return (
            <MeetCall
                meetCode={params.meetCode}
                userPreferences={userPreferencesState}
                updateUserPreferences={updateUserPreferences}
                meet={meetState}
            />
        );
    } else {
        return (
            <JoinMeet
                meetCode={params.meetCode}
                userPreferences={userPreferencesState}
                updateUserPreferences={updateUserPreferences}
                meet={meetState}
            />
        );
    }
}
