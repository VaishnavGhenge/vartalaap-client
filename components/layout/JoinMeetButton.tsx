import {useCallback, useState} from "react"
import {useRouter} from "next/navigation";
import {httpServerUri} from "@/utils/config";
import {Button} from "@/components/utility/Button";
import {useRecoilValue} from "recoil";
import {currentMeetCode} from "@/recoil/global";

export const JoinMeetButton = () => {
    const router = useRouter();

    const meetCode = useRecoilValue(currentMeetCode);

    const onJoinButtonClick = useCallback(() => {
        fetch(`${httpServerUri}/meets/join?meetId=${meetCode}`, {
            method: "GET",
            headers: {
                'Content-Type': 'application/json',
            },
        })
            .then((response) => response.json())
            .then((data) => {
                window.sessionStorage.setItem("sessionId", data.sessionId);
                window.sessionStorage.setItem("meetId", data.meetId);

                const meetId = data.meetId;
                router.push(`/${meetId}?type=member`);
            });
    }, [meetCode, router]);

    return (
        <Button
            className='text-sm text-sky-700 px-3 py-2 rounded hover:bg-sky-100 hover:cursor-pointer disabled:hover:cursor-not-allowed'
            onClick={onJoinButtonClick}
            disabled={!meetCode}
        >
            Join
        </Button>
    )
}