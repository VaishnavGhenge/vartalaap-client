import "./globals.css";
import type {Metadata, Viewport} from "next";
import { Fraunces, Geist, Instrument_Sans } from "next/font/google";
import { cookies } from "next/headers";
import React from "react";
import {HomeWrapper} from "@/src/components/ui/HomeWrapper";
import {Providers} from "@/src/components/providers";
import {SentryInit} from "@/src/components/SentryInit";

// Two faces, not four. The old stack loaded Inter, Plus Jakarta Sans and
// Montserrat alongside Geist, which is three of the most-used webfonts in
// software and the reason nothing on the page had a voice.
//
// Fraunces is a warm, high-contrast serif with an optical size axis: it gets
// its own personality at display sizes without turning mushy in a heading.
// It carries the editorial, consulting-room register. Instrument Sans handles
// every pixel of UI — quiet, well-spaced, and specifically not Inter.
const fraunces = Fraunces({
    subsets: ["latin"],
    variable: "--font-display",
    display: "swap",
    axes: ["SOFT", "WONK", "opsz"],
});
const instrument = Instrument_Sans({ subsets: ["latin"], variable: "--font-ui", display: "swap" });

// Wordmark only. Kept while the logotype is Geist; changing it would change
// the logo, which is a brand decision rather than a styling one.
const geist = Geist({ subsets: ["latin"], variable: "--font-brand", display: "swap", weight: ["500", "600", "700"] });

export const metadata: Metadata = {
    title: "Sessionly: booking pages with the video call built in",
    description: "A booking link for coaches, consultants and therapists, with a private video room for every session. Free while in beta.",
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
            <body className={`${instrument.className} ${instrument.variable} ${fraunces.variable} ${geist.variable}`}>
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
