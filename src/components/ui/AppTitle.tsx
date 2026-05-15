import Link from "next/link";
import { SessionlyWordmark } from "@/src/components/ui/SessionlyWordmark";

const AppTitle = () => {
    return (
        <Link href="/" className="inline-flex items-center">
            <SessionlyWordmark className="text-[1.05rem] text-[hsl(var(--foreground))]" />
        </Link>
    );
};

export default AppTitle;
