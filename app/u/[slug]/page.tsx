import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/src/components/ui/button";
import { SessionlyBrand } from "@/src/components/ui/SessionlyBrand";
import { httpServerUri } from "@/src/services/api/config";
import type { HostProfile } from "@/src/services/api/public";

// Server-rendered so the profile page works without JS and so search engines
// can index host pages cleanly (matches the SEO requirement in roadmap §4).
// We fetch through the absolute httpServerUri rather than the public.ts client
// because that helper is bundled with `credentials: 'include'` for the
// browser; on the server we just need a plain GET.
async function fetchProfile(slug: string): Promise<HostProfile | null> {
    const res = await fetch(`${httpServerUri}/u/${encodeURIComponent(slug)}`, {
        // Hosts can publish a new event between requests; small window is fine
        // but we don't want a long CDN cache here. 60s matches the rate limit
        // window for `/u/` so a single visitor's burst never re-hits origin.
        next: { revalidate: 60 },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`profile fetch ${res.status}`);
    return (await res.json()) as HostProfile;
}

interface PageProps {
    params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps) {
    const { slug } = await params;
    const profile = await fetchProfile(slug).catch(() => null);
    if (!profile) {
        return { title: "Not found · Sessionly" };
    }
    return {
        title: `Book time with ${profile.name} · Sessionly`,
        description: `Pick a time to meet with ${profile.name}.`,
    };
}

export default async function HostProfilePage({ params }: PageProps) {
    const { slug } = await params;
    const profile = await fetchProfile(slug);
    if (!profile) notFound();

    return (
        <div className="relative flex min-h-dvh flex-col">
            <main className="flex flex-1 flex-col items-center px-4 py-12 sm:px-6">
                <Link href="/" className="mb-8">
                    <SessionlyBrand size="md" wordmarkClassName="text-2xl" markClassName="size-8" />
                </Link>

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
            </main>
        </div>
    );
}
