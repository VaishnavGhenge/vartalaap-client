import { Mic, MicOff } from "lucide-react";
import { ControlButton } from "./ControlButton";

interface IMicButtonProps {
    onClickFn: (micStatus: boolean) => void;
    action: "close" | "open";
    size?: "sm" | "md";
}

export function MicButton({ onClickFn, action, size = "md" }: IMicButtonProps) {
    const on = action === "open";
    return (
        <ControlButton
            onClick={() => onClickFn(on)}
            active={on}
            activeIcon={Mic}
            inactiveIcon={MicOff}
            activeLabel="Mute microphone"
            inactiveLabel="Unmute microphone"
            size={size}
        />
    );
}
