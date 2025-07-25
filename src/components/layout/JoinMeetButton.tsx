import {Button} from "@/src/components/ui/Button";

export const JoinMeetButton = () => {

    return (
        <Button
            className='text-sm text-sky-700 px-3 py-2 rounded hover:bg-sky-100 hover:cursor-pointer disabled:hover:cursor-not-allowed'
        >
            Join
        </Button>
    )
}