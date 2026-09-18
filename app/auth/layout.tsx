import { privatePageMetadata } from "@/src/lib/seo";

export const metadata = privatePageMetadata;

export default function AuthLayout({ children }: { children: React.ReactNode }) {
    return children;
}
