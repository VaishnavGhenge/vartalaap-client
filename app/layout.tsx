import "./globals.css";
import type {Metadata} from "next";
import {Inter} from "next/font/google";
import React from "react";
import {HomeWrapper} from "@/components/layout/HomeWrapper";
import {GlobalAlert} from "@/components/utility/GlobalAlert";
import {getBackendStatus} from "@/utils/common";

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
    const initialBackendStatus = await getBackendStatus(); // Server fetch

    return (
        <html lang='en'>
            <body className={inter.className}>
                <HomeWrapper>
                    <GlobalAlert initialBackendStatus/>
                    {children}
                </HomeWrapper>
            </body>
        </html>
    );
}
