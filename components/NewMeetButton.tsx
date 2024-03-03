import { useCallback } from "react";
import { useRecoilValue } from "recoil";
import { meet } from "@/utils/globalStates";
import { useRouter } from "next/navigation";

interface IProps {
    meetId: string;
}

export const NewMeetingButton = ({ meetId }: IProps) => {
    const router = useRouter();
    const meetState = useRecoilValue(meet);

    const onNewMeetButtonClick = useCallback(() => {
        meetState.requestSession(true);

        router.push(`/${meetId}`);
    }, [meetState, meetId, router]);

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