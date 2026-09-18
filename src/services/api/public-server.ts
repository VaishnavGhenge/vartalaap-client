import { httpServerUri } from "@/src/services/api/config";
import type { HostProfile, PublicEventResponse } from "@/src/services/api/public";

async function fetchPublicResource<T>(path: string): Promise<T | null> {
    const response = await fetch(`${httpServerUri}${path}`, {
        next: { revalidate: 60 },
    });

    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`public resource fetch ${response.status}`);
    return (await response.json()) as T;
}

export function fetchPublicProfile(slug: string): Promise<HostProfile | null> {
    return fetchPublicResource<HostProfile>(`/u/${encodeURIComponent(slug)}`);
}

export function fetchPublicEvent(hostSlug: string, eventSlug: string): Promise<PublicEventResponse | null> {
    return fetchPublicResource<PublicEventResponse>(
        `/u/${encodeURIComponent(hostSlug)}/${encodeURIComponent(eventSlug)}`,
    );
}
