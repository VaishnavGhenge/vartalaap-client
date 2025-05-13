"use client";

import Navbar from "@/components/layout/Navbar";
import {IBM_Plex_Sans_Devanagari} from "next/font/google";
import Image from "next/image";
import {NewMeetingButton} from "@/components/layout/NewMeetButton";
import {JoinMeetButton} from "@/components/layout/JoinMeetButton";
import {useRecoilState} from "recoil";
import {currentMeetCode} from "@/recoil/global";

const ibmPlexSansDevanagari = IBM_Plex_Sans_Devanagari({
    weight: "500",
    subsets: ["cyrillic-ext"],
});

export default function Home() {
    const [meetCodeInput, setMeetCode] = useRecoilState(currentMeetCode);

    return (
        <div>
            <Navbar></Navbar>
            <main className='h-full'>
                <div className='container mx-auto'>
                    <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
                        <div className='w-100 flex justify-center items-center'>
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

                            <div className='flex flex-wrap gap-4'>
                                <NewMeetingButton/>
                                <div className='flex gap-2'>
                                    <input
                                        value={meetCodeInput}
                                        onChange={e => setMeetCode(e.target.value)}
                                        className="input w-[200px]"
                                        type='text'
                                        name='meet-code'
                                        placeholder='meeting code or link here'
                                    />
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
