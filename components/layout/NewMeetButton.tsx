import {useCallback, useEffect} from "react";
import {useRouter} from "next/navigation";
import {httpServerUri} from "@/utils/config";
import {post} from "@/utils/api";

interface Props {
    disabled: boolean;
}

export const NewMeetingButton = ({disabled}: Props) => {
    const router = useRouter();

    const onNewMeetButtonClick = useCallback(() => {
        post(`${httpServerUri}/meets/create`)
            .then((response) => response.json())
            .then((data) => {
                window.sessionStorage.setItem("sessionId", data.sessionId);
                window.sessionStorage.setItem("meetId", data.meetId);

                const meetId = data.meetId;
                router.push(`/${meetId}?type=owner`);
            });
    }, []);

    useEffect(() => {

    }, []);

    return (
        <button
            className="btn-vartalaap"
            type='button'
            onClick={onNewMeetButtonClick}
            disabled={disabled}
        >
            New meeting
        </button>
    )
}