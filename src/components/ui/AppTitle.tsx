import { IBM_Plex_Sans_Devanagari } from "next/font/google";
import Link from "next/link";

const ibmPlexSansDevanagari = IBM_Plex_Sans_Devanagari({
    weight: "500",
    subsets: ["cyrillic-ext"],
});

const AppTitle = () => {
    return (
        <Link href="/" className={`${ibmPlexSansDevanagari.className}`}>
            <h2 className='text-xl'>वार्तालाप</h2>
        </Link>
    );
};

export default AppTitle;
