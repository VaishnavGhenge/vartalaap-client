import type { Metadata } from "next";
import { createPublicPageMetadata } from "@/src/lib/seo";

export const metadata: Metadata = createPublicPageMetadata({
    title: "Changelog — Sessionly",
    description: "Product updates and improvements to Sessionly booking pages and video calls.",
    path: "/changelog",
});

export default function ChangelogLayout({ children }: { children: React.ReactNode }) {
    return children;
}
