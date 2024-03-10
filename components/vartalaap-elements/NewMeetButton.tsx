import {useCallback, useEffect, useMemo} from "react";
import {useRouter} from "next/navigation";
import {httpServerUri} from "@/utils/config";

export const NewMeetingButton = () => {
    const router = useRouter();

    const onNewMeetButtonClick = useCallback(() => {
        fetch(`${httpServerUri}/create-meet`, {
            method: "POST",
            headers: {
                'Content-Type': 'application/json',
            },
        })
            .then((response) => response.json())
            .then((data) => {
                window.sessionStorage.setItem("sessionId", data.sessionId);
                window.sessionStorage.setItem("meetId", data.meetId);

                const meetId = data.meetId;
                router.push(`/${meetId}?role=creating`);
            });
    }, []);

    useEffect(() => {

    }, []);

    return (
        <button
            className='bg-sky-700 px-4 py-2 rounded text-white hover:bg-sky-800 transition duration-300'
            type='button'
            onClick={onNewMeetButtonClick}
        >
            <span>New meeting</span>
        </button>
    )
}