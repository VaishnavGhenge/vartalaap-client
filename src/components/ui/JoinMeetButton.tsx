import { Button } from "@/src/components/ui/button";
import { ComponentProps } from "react";
import { Loader2 } from "lucide-react";

interface JoinMeetButtonProps extends Omit<ComponentProps<typeof Button>, "onClick"> {
    onJoin?: () => void;
    loading?: boolean;
}

export const JoinMeetButton = ({ onJoin, loading = false, children, ...props }: JoinMeetButtonProps) => {
    return (
        <Button
            variant="secondary"
            onClick={onJoin}
            aria-busy={loading}
            {...props}
            disabled={loading || props.disabled}
        >
            {loading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {children ?? (loading ? "Joining..." : "Join")}
        </Button>
    )
}
