import type { MetadataRoute } from "next";

import { SITE_URL } from "@/src/lib/seo";

const publicRoutes = [
    { path: "/", changeFrequency: "weekly", priority: 1 },
    { path: "/changelog", changeFrequency: "monthly", priority: 0.6 },
    { path: "/privacy", changeFrequency: "yearly", priority: 0.2 },
    { path: "/terms", changeFrequency: "yearly", priority: 0.2 },
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
    return publicRoutes.map(({ path, changeFrequency, priority }) => ({
        url: new URL(path, SITE_URL).toString(),
        changeFrequency,
        priority,
    }));
}
