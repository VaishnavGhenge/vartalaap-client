import { meet } from "@/utils/globalStates";
import { useCallback } from "react"
import { useRecoilValue } from "recoil";
import { useRouter } from "next/navigation";

interface IProps {
    meetId: string;
}

export const JoinMeetButton = ({ meetId }: IProps) => {
    const router = useRouter();
    const meetState = useRecoilValue(meet);

    const onJoinButtonClick = useCallback(() => {
        meetState.requestSession();

        router.push(`/${meetId}`);
    }, [meetState, meetId, router]);

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