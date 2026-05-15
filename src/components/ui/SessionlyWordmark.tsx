import { cn } from "@/src/lib/utils";

type SessionlyWordmarkProps = {
    className?: string;
    showDotCom?: boolean;
};

export function SessionlyWordmark({ className, showDotCom = true }: SessionlyWordmarkProps) {
    return (
        <span
            className={cn(
                "inline-flex items-baseline font-[var(--font-sessionly)] font-light tracking-normal",
                className,
            )}
        >
            <span>getsessionly</span>
            {showDotCom && <span className="opacity-55">.com</span>}
        </span>
    );
}
