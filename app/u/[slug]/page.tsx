import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Button } from "@/src/components/ui/button";
import { PoweredBy } from "@/src/components/ui/PoweredBy";
import { StandaloneHeader } from "@/src/components/ui/StandaloneHeader";
import { createPublicPageMetadata } from "@/src/lib/seo";
import { fetchPublicProfile } from "@/src/services/api/public-server";

interface PageProps {
    params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { slug } = await params;
    const profile = await fetchPublicProfile(slug).catch(() => null);
    if (!profile) {
        return {
            title: "Not found · Sessionly",
            robots: { index: false, follow: false },
        };
    }
    return createPublicPageMetadata({
        title: `Book time with ${profile.name} · Sessionly`,
        description: `Pick a time to meet with ${profile.name}.`,
        path: `/u/${encodeURIComponent(profile.slug)}`,
    });
}

export default async function HostProfilePage({ params }: PageProps) {
    const { slug } = await params;
    const profile = await fetchPublicProfile(slug);
    if (!profile) notFound();

    return (
        <div className="relative flex min-h-dvh flex-col">
            <main className="flex flex-1 flex-col items-center px-4 py-6 sm:px-6 sm:py-12">
                <StandaloneHeader />

                <div className="w-full max-w-xl">
                    <header className="text-center">
                        <h1 className="text-2xl font-semibold tracking-tight text-[hsl(var(--foreground))] sm:text-3xl">
                            {profile.name}
                        </h1>
                        <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
                            {profile.timezone.replace(/_/g, " ")}
                        </p>
                    </header>

                    <section className="mt-8 flex flex-col gap-3">
                        {profile.eventTypes.length === 0 ? (
                            <div className="app-panel rounded-2xl px-5 py-8 text-center text-sm text-[hsl(var(--muted-foreground))]">
                                {profile.name} hasn&apos;t published any event types yet.
                            </div>
                        ) : (
                            profile.eventTypes.map((evt) => (
                                <Link
                                    key={evt.id}
                                    href={`/u/${profile.slug}/${evt.slug}`}
                                    className="app-panel group flex items-center justify-between rounded-2xl px-5 py-4 transition-colors hover:border-[hsl(var(--primary))]/40"
                                    prefetch
                                >
                                    <div className="min-w-0">
                                        <h2 className="truncate text-base font-medium text-[hsl(var(--foreground))]">
                                            {evt.title}
                                        </h2>
                                        <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                                            {evt.durationMin} min
                                            {evt.description ? ` · ${evt.description}` : ""}
                                        </p>
                                    </div>
                                    <Button variant="secondary" size="sm" asChild>
                                        <span>Book</span>
                                    </Button>
                                </Link>
                            ))
                        )}
                    </section>
                </div>
                <PoweredBy />
            </main>
        </div>
    );
}
