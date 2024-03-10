import {useCallback} from "react"
import {useRouter} from "next/navigation";
import {httpServerUri} from "@/utils/config";

interface IProps {
    meetId: string;
}

export const JoinMeetButton = ({meetId}: IProps) => {
    const router = useRouter();

    const onJoinButtonClick = useCallback(() => {
        fetch(`${httpServerUri}/join-meet?meetId=${meetId}`, {
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
                router.push(`/${meetId}?role=joining`);
            });
    }, [meetId]);

    return (
        <button
            type='button'
            className='text-sky-700 px-3 py-2 rounded hover:bg-sky-100 hover:cursor-pointer disabled:text-gray-400'
            onClick={onJoinButtonClick}
        >
            Join
        </button>
    )
}