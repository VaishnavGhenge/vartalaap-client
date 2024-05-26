import {useCallback} from "react"
import {useRouter} from "next/navigation";
import {httpServerUri} from "@/utils/config";

interface IProps {
    meetId: string;
    disabled: boolean
}

export const JoinMeetButton = ({meetId, disabled}: IProps) => {
    const router = useRouter();

    const onJoinButtonClick = useCallback(() => {
        fetch(`${httpServerUri}/meets/join?meetId=${meetId}`, {
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
            className='text-sm text-sky-700 px-3 py-2 rounded hover:bg-sky-100 hover:cursor-pointer disabled:hover:cursor-not-allowed'
            onClick={onJoinButtonClick}
            disabled={disabled}
        >
            Join
        </button>
    )
}