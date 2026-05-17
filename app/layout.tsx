import "./globals.css";
import type {Metadata, Viewport} from "next";
import { Inter, Montserrat, Plus_Jakarta_Sans } from "next/font/google";
import React from "react";
import {HomeWrapper} from "@/src/components/ui/HomeWrapper";
import {Providers} from "@/src/components/providers";
import {SentryInit} from "@/src/components/SentryInit";

const inter = Inter({ subsets: ["latin"] });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });
const montserrat = Montserrat({ subsets: ["latin"], variable: "--font-montserrat", display: "swap" });

export const metadata: Metadata = {
    title: "Sessionly — Book, meet, and get paid",
    description: "The scheduling tool for coaches, consultants, and independent professionals. Booking pages and video calls in one place.",
};

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
};

const themeScript = `
(() => {
  const key = "vartalaap-theme";
  const saved = localStorage.getItem(key);
  const theme = saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
})();
`;

export default async function RootLayout({
                                       children,
                                   }: {
    children: React.ReactNode;
}) {
    return (
        <html lang='en' suppressHydrationWarning>
            <head>
                {/* biome-ignore lint: theme init must run before paint to avoid flash */}
                <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: themeScript }} />
            </head>
            <body className={`${inter.className} ${jakarta.variable} ${montserrat.variable}`}>
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
