import { Video, VideoOff } from "lucide-react";

interface ICameraButtonProps {
    onClickFn: (cameraStatus: boolean) => void;
    action: "open" | "close";
    size?: "sm" | "md";
}

export function CameraButton({ onClickFn, action, size = "md" }: ICameraButtonProps) {
    const on = action === "open";
    const dim = size === "sm" ? "h-8 w-8" : "h-9 w-9 sm:h-11 sm:w-11";
    const icon = size === "sm" ? "w-4 h-4" : "w-4 h-4 sm:w-5 sm:h-5";
    return (
        <button
            type='button'
            onClick={() => onClickFn(on)}
            aria-label={on ? "Turn camera off" : "Turn camera on"}
            className={`press flex ${dim} cursor-pointer items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-glow))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--surface))] ${
                on
                    ? 'border border-[hsl(var(--border))]/70 bg-[hsl(var(--surface-2))]/85 text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-3))]'
                    : 'bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))] shadow-lg shadow-[hsl(var(--destructive))]/25 hover:brightness-110'
            }`}
        >
            {on ? <Video className={icon} /> : <VideoOff className={icon} />}
        </button>
    );
}
