import { Button } from "@/src/components/ui/button";
import { ComponentProps } from "react";

interface JoinMeetButtonProps extends Omit<ComponentProps<typeof Button>, "onClick"> {
    onJoin?: () => void;
}

export const JoinMeetButton = ({ onJoin, ...props }: JoinMeetButtonProps) => {
    return (
        <Button
            variant="secondary"
            onClick={onJoin}
            {...props}
        >
            Join
        </Button>
    )
}
