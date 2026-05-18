import "./globals.css";
import type {Metadata, Viewport} from "next";
import { Geist, Inter, Montserrat, Plus_Jakarta_Sans } from "next/font/google";
import { cookies } from "next/headers";
import React from "react";
import {HomeWrapper} from "@/src/components/ui/HomeWrapper";
import {Providers} from "@/src/components/providers";
import {SentryInit} from "@/src/components/SentryInit";

const inter = Inter({ subsets: ["latin"] });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });
const montserrat = Montserrat({ subsets: ["latin"], variable: "--font-montserrat", display: "swap" });
// Wordmark-only font — Vercel's Geist, a premium geometric grotesk
// commissioned for tech brands. Closest free equivalent to Stripe Sans.
// Loaded just for the logo so we keep the body in Inter.
const geist = Geist({ subsets: ["latin"], variable: "--font-brand", display: "swap", weight: ["500", "600", "700"] });

export const metadata: Metadata = {
    title: "Sessionly — Book, meet, and get paid",
    description: "The scheduling tool for coaches, consultants, and independent professionals. Booking pages and video calls in one place.",
};

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
};

export default async function RootLayout({
                                       children,
                                   }: {
    children: React.ReactNode;
}) {
    // Read the theme cookie server-side so we can set the class on <html>
    // before paint without an inline <script>. "system" with no client hint
    // falls back to light here; ThemeProvider corrects it on mount and writes
    // the cookie so subsequent SSRs render the right class.
    const cookieTheme = (await cookies()).get("vartalaap-theme")?.value;
    const isDark = cookieTheme === "dark";

    return (
        <html lang='en' className={isDark ? "dark" : undefined} data-theme={isDark ? "dark" : "light"} suppressHydrationWarning>
            <body className={`${inter.className} ${jakarta.variable} ${montserrat.variable} ${geist.variable}`}>
                <SentryInit />
                <Providers>
                    <HomeWrapper>
                        {children}
                    </HomeWrapper>
                </Providers>
            </body>
        </html>
    );
}
