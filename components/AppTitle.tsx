import { IBM_Plex_Sans_Devanagari } from "next/font/google";

const ibmPlexSansDevanagari = IBM_Plex_Sans_Devanagari({
    weight: "500",
    subsets: ["cyrillic-ext"],
});

const AppTitle = () => {
    return (
        <div className={ibmPlexSansDevanagari.className}>
            <h2 className='text-xl'>वार्तालाप</h2>
        </div>
    );
};

export default AppTitle;
