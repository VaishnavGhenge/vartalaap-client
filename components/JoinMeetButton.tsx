import {useCallback} from "react"
import {useRouter} from "next/navigation";

interface IProps {
    meetId: string;
}

export const JoinMeetButton = ({meetId}: IProps) => {
    const router = useRouter();

    const onJoinButtonClick = useCallback(() => {
        router.push(`/${meetId}?role=joining`);
    }, []);

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