import type { Metadata } from "next";
import { createPublicPageMetadata } from "@/src/lib/seo";

export const metadata: Metadata = createPublicPageMetadata({
    title: "Pricing — Sessionly",
    description: "Sessionly is free while in beta, with booking pages, calendar sync, and video calls included.",
    path: "/pricing",
});

export default function PricingLayout({ children }: { children: React.ReactNode }) {
    return children;
}
