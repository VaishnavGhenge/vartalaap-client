import { Video, VideoOff } from "lucide-react";
import { ControlButton } from "./ControlButton";

interface ICameraButtonProps {
    onClickFn: (cameraStatus: boolean) => void;
    action: "open" | "close";
    size?: "sm" | "md";
}

export function CameraButton({ onClickFn, action, size = "md" }: ICameraButtonProps) {
    const on = action === "open";
    return (
        <ControlButton
            onClick={() => onClickFn(on)}
            active={on}
            activeIcon={Video}
            inactiveIcon={VideoOff}
            activeLabel="Turn camera off"
            inactiveLabel="Turn camera on"
            size={size}
        />
    );
}
