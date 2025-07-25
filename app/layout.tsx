import "./globals.css";
import type {Metadata} from "next";
import {Inter} from "next/font/google";
import React from "react";
import {HomeWrapper} from "@/src/components/ui/HomeWrapper";
import {Providers} from "@/src/components/providers";

const inter = Inter({subsets: ["latin"]});

export const metadata: Metadata = {
    title: "Vartalaap",
    description: "Video chat app",
};

export default async function RootLayout({
                                       children,
                                   }: {
    children: React.ReactNode;
}) {
    return (
        <html lang='en'>
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
