import type { Metadata } from "next";

export const SITE_NAME = "Sessionly";
export const SITE_URL = new URL("https://www.getsessionly.com");
export const SITE_DESCRIPTION =
    "A booking link for coaches, consultants and therapists, with a private video room for every session. Free while in beta.";

interface PublicPageMetadata {
    title: string;
    description: string;
    path: string;
}

export function createPublicPageMetadata({ title, description, path }: PublicPageMetadata): Metadata {
    return {
        title,
        description,
        alternates: { canonical: path },
        openGraph: {
            type: "website",
            siteName: SITE_NAME,
            locale: "en_US",
            title,
            description,
            url: path,
            images: [
                {
                    url: "/brand/sessionly-mark-1024.png",
                    width: 1024,
                    height: 1024,
                    alt: SITE_NAME,
                },
            ],
        },
        twitter: {
            card: "summary",
            title,
            description,
            images: ["/brand/sessionly-mark-1024.png"],
        },
    };
}

export const privatePageMetadata: Metadata = {
    robots: {
        index: false,
        follow: false,
        googleBot: {
            index: false,
            follow: false,
        },
    },
};
