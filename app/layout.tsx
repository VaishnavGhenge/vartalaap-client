import "./globals.css";
import type {Metadata, Viewport} from "next";
import {Inter} from "next/font/google";
import React from "react";
import {HomeWrapper} from "@/src/components/ui/HomeWrapper";
import {Providers} from "@/src/components/providers";

const inter = Inter({subsets: ["latin"]});

export const metadata: Metadata = {
    title: "Vartalaap",
    description: "Video chat app",
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
  const theme = saved === "light" || saved === "dark" || saved === "system" ? saved : "light";
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
            <body className={inter.className}>
                <Providers>
                    <HomeWrapper>
                        {children}
                    </HomeWrapper>
                </Providers>
            </body>
        </html>
    );
}
