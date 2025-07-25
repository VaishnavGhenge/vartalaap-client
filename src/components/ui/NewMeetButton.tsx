import {useCallback, useEffect} from "react";
import {useRouter} from "next/navigation";
import { Button } from "@/src/components/ui/button";
import {createMeet} from "@/src/services/api/meet";


export const NewMeetingButton = () => {
    const router = useRouter();

    const onNewMeetButtonClick = useCallback(() => {
        createMeet()
            .then((response) => response.json())
            .then((data) => {
                window.sessionStorage.setItem("sessionId", data.sessionId);
                window.sessionStorage.setItem("meetId", data.meetId);

                const meetId = data.meetId;
                router.push(`/${meetId}?type=owner`);
            });
    }, [router]);

    useEffect(() => {

    }, []);

    return (
        <Button
            onClick={onNewMeetButtonClick}
        >
            New meeting
        </Button>
    )
}