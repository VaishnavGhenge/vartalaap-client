import {useRouter} from "next/navigation";
import {Button} from "@/src/components/ui/button";
import {createMeet} from "@/src/services/api/meet";


export const NewMeetingButton = () => {
    const router = useRouter();

    const requestNewMeet = () => {
        // createMeet()
        //     .then((response) => response.json())
        //     .then((data) => {
        //         const meetId = data.meetId;
        //         router.push(`/${meetId}`);
        //     });
        router.push(`/xyz`);
    }

    return (
        <Button
            onClick={requestNewMeet}
        >
            New meeting
        </Button>
    )
}