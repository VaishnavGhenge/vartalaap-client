import type { Metadata } from "next";

import { createPublicPageMetadata } from "@/src/lib/seo";
import { fetchPublicEvent } from "@/src/services/api/public-server";

interface LayoutProps {
    children: React.ReactNode;
    params: Promise<{ slug: string; event: string }>;
}

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
    const { slug, event } = await params;
    const publicEvent = await fetchPublicEvent(slug, event).catch(() => null);

    if (!publicEvent) {
        return {
            title: "Booking page not found · Sessionly",
            robots: { index: false, follow: false },
        };
    }

    const canonicalPath = `/u/${encodeURIComponent(publicEvent.host.slug)}/${encodeURIComponent(publicEvent.event.slug)}`;
    const description = publicEvent.event.description
        ?? `Book a ${publicEvent.event.durationMin}-minute session with ${publicEvent.host.name}.`;
    const title = `${publicEvent.event.title} with ${publicEvent.host.name} · Sessionly`;

    return createPublicPageMetadata({
        title,
        description,
        path: canonicalPath,
    });
}

export default function PublicEventLayout({ children }: LayoutProps) {
    return children;
}
