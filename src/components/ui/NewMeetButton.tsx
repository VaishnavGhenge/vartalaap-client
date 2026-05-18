import {useRouter} from "next/navigation";
import {Button} from "@/src/components/ui/button";
import { ComponentProps, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createMeet } from "@/src/services/api/meet";
import { roomPath } from "@/src/lib/room-routes";

export const NewMeetingButton = (props: Omit<ComponentProps<typeof Button>, "onClick">) => {
    const router = useRouter();
    const [isCreating, setIsCreating] = useState(false);

    const requestNewMeet = async () => {
        if (isCreating) return;
        setIsCreating(true);
        try {
            const meet = await createMeet();
            router.push(roomPath(meet.meetCode));
        } catch {
            toast.error("Could not create meeting. Please try again.");
            setIsCreating(false);
        }
    }

    return (
        <Button
            onClick={requestNewMeet}
            aria-busy={isCreating}
            {...props}
            disabled={isCreating || props.disabled}
        >
            {isCreating && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {isCreating ? "Creating..." : "New meeting"}
        </Button>
    )
}
