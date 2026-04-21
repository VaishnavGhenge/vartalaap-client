import { IBM_Plex_Sans_Devanagari } from "next/font/google";
import Link from "next/link";

const ibmPlexSansDevanagari = IBM_Plex_Sans_Devanagari({
    weight: "500",
    subsets: ["cyrillic-ext"],
});

const AppTitle = () => {
    return (
        <Link href="/" className={`${ibmPlexSansDevanagari.className} inline-flex items-center gap-3`}>
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,hsl(var(--primary)),hsl(var(--brand-glow)))] text-sm font-semibold text-[hsl(var(--primary-foreground))] shadow-lg shadow-[hsl(var(--shadow-color))]/20">
                व
            </span>
            <span className='text-xl text-[hsl(var(--foreground))]'>वार्तालाप</span>
        </Link>
    );
};

export default AppTitle;
