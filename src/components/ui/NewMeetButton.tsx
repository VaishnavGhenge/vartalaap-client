import {useRouter} from "next/navigation";
import {Button} from "@/src/components/ui/button";

const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

function generateMeetCode(): string {
    const bytes = new Uint8Array(10);
    crypto.getRandomValues(bytes);
    const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]);
    return `${chars.slice(0, 3).join("")}-${chars.slice(3, 7).join("")}-${chars.slice(7, 10).join("")}`;
}

export const NewMeetingButton = () => {
    const router = useRouter();

    const requestNewMeet = () => {
        router.push(`/${generateMeetCode()}`);
    }

    return (
        <Button
            onClick={requestNewMeet}
        >
            New meeting
        </Button>
    )
}