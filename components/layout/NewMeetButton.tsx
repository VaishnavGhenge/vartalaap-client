import {useCallback, useEffect} from "react";
import {useRouter} from "next/navigation";
import {httpServerUri} from "@/utils/config";
import {post} from "@/utils/api";
import {Button} from "@/components/utility/Button";


export const NewMeetingButton = () => {
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
        <Button
            className="btn-vartalaap"
            onClick={onNewMeetButtonClick}
        >
            New meeting
        </Button>
    )
}