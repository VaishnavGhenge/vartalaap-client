import {useCallback, useEffect} from "react";
import {useRouter} from "next/navigation";
import {httpServerUri} from "@/utils/config";

interface Props {
    isBackendHealthy: boolean;
}

export const NewMeetingButton = ({isBackendHealthy}: Props) => {
    const router = useRouter();

    const onNewMeetButtonClick = useCallback(() => {
        fetch(`${httpServerUri}/meets/create`, {
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
            className="btn-vartalaap"
            type='button'
            onClick={onNewMeetButtonClick}
            disabled={!isBackendHealthy}
        >
            New meeting
        </button>
    )
}