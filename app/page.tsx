"use client";

import Navbar from "@/src/components/ui/Navbar";
import {IBM_Plex_Sans_Devanagari} from "next/font/google";
import Image from "next/image";
import {NewMeetingButton} from "@/src/components/ui/NewMeetButton";
import {JoinMeetButton} from "@/src/components/ui/JoinMeetButton";
import { Input } from "@/src/components/ui/input";

const ibmPlexSansDevanagari = IBM_Plex_Sans_Devanagari({
    weight: "500",
    subsets: ["cyrillic-ext"],
});

export default function Home() {
    return (
        <div>
            <Navbar></Navbar>
            <main className='mt-12 h-full'>
                <div className='container mx-4 md:mx-auto my-auto'>
                    <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
                        <div className='flex justify-center items-center'>
                            <Image
                                className='hidden w-full h-full md:block'
                                src='/static/images/hero.svg'
                                alt='Hero image'
                                width={768}
                                height={596}
                                priority={true}
                            />
                        </div>
                        <div className='w-100 flex flex-col justify-center items-start'>
                            <h2 className='text-3xl pb-4 capitalize'>
                                <span>Vartalaap - </span>
                                <span
                                    className={ibmPlexSansDevanagari.className}
                                >
                                    वार्तालाप
                                </span>
                            </h2>
                            <p className='font-light pb-12'>
                                A video chatting app which enable you to connect
                                and organize meetings seamlessly
                            </p>

                            <div className='grid grid-rows-2 grid-cols-4 gap-4'>
                                <div className='col-span-3'>
                                    <NewMeetingButton/>
                                </div>

                                <div className='col-span-3'>
                                    <Input
                                        type='text'
                                        name='meet-code'
                                        placeholder='meeting code or link'
                                    />
                                </div>

                                <div className='col-span-1'>
                                    <JoinMeetButton />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
