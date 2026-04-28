import Link from "next/link";
import { BrandWordmark } from "@/src/components/ui/BrandWordmark";

const AppTitle = () => {
    return (
        <Link href="/" className="inline-flex items-center gap-3">
            <span className="brand-badge flex h-10 w-10 items-center justify-center rounded-2xl text-sm font-semibold text-[hsl(var(--primary-foreground))] shadow-lg shadow-[hsl(var(--shadow-color))]/20">
                व
            </span>
            <BrandWordmark className="text-[1.45rem]" variant="rozha" />
        </Link>
    );
};

export default AppTitle;
