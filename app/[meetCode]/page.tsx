"use client";

import { useRecoilValue } from "recoil";

import { isMeetJoined } from "@/utils/globalStates";
import JoinMeet from "@/components/meet/JoinMeet";
import MeetCall from "@/components/meet/MeetCall";

export default function Meet({ params }: { params: { meetCode: string } }) {
    const isMeetJoinedState = useRecoilValue(isMeetJoined);

    if (isMeetJoinedState) {
        return <MeetCall meetCode={params.meetCode} />;
    } else {
        return <JoinMeet meetCode={params.meetCode} />;
    }
}
