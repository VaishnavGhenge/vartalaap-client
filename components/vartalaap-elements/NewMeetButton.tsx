import {useCallback} from "react";
import {useRouter} from "next/navigation";
import {httpServerUri} from "@/utils/config";

export const NewMeetingButton = () => {
    const router = useRouter();

    const onNewMeetButtonClick = useCallback(() => {
        fetch(`${httpServerUri}/get-meetId`, {
            method: "POST",
            headers: {
                'Content-Type': 'application/json',
            },
        })
            .then((response) => response.json())
            .then((data) => {
                const meetId = data.meetId;
                router.push(`/${meetId}?role=creating`);
            });
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