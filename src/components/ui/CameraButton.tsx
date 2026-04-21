import { Video, VideoOff } from "lucide-react";

interface ICameraButtonProps {
    onClickFn: (cameraStatus: boolean) => void;
    action: "open" | "close";
}

export function CameraButton({ onClickFn, action }: ICameraButtonProps) {
    const on = action === "open";
    return (
        <button
            type='button'
            onClick={() => onClickFn(on)}
            aria-label={on ? "Turn camera off" : "Turn camera on"}
            className={`press flex h-11 w-11 cursor-pointer items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-glow))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--surface))] ${
                on
                    ? 'border border-[hsl(var(--border))]/70 bg-[hsl(var(--surface-2))]/85 text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-3))]'
                    : 'bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))] shadow-lg shadow-[hsl(var(--destructive))]/25 hover:brightness-110'
            }`}
        >
            {on ? <Video className='w-5 h-5' /> : <VideoOff className='w-5 h-5' />}
        </button>
    );
}
