"use client";

import Navbar from "../components/vartalaap-elements/Navbar";
import {IBM_Plex_Sans_Devanagari} from "next/font/google";
import Image from "next/image";
import {ChangeEvent, useState} from "react";
import {NewMeetingButton} from "@/components/vartalaap-elements/NewMeetButton";
import {JoinMeetButton} from "@/components/vartalaap-elements/JoinMeetButton";

const ibmPlexSansDevanagari = IBM_Plex_Sans_Devanagari({
    weight: "500",
    subsets: ["cyrillic-ext"],
});

export default function Home() {
    const [joinButtonDisabled, setJoinButtonDisabled] = useState(true);
    const [meetCode, setMeetCode] = useState("");

    const onMeetCodeChange = (event: ChangeEvent<HTMLInputElement>) => {
        setMeetCode(event.target.value);
        if (event.target.value.length > 0) {
            setJoinButtonDisabled(false);
        } else {
            setJoinButtonDisabled(true);
        }
    };

    return (
        <div>
            <Navbar></Navbar>
            <main className='h-full'>
                <div className='container mx-auto'>
                    <div className='grid grid-cols-2 gap-4'>
                        <div className='w-100 flex justify-center items-center'>
                            <Image
                                className='w-full h-full'
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

                            <div className='flex gap-4'>
                                <NewMeetingButton />
                                <div className='flex gap-2'>
                                    <input
                                        value={meetCode}
                                        onChange={onMeetCodeChange}
                                        className='bg-slate-300 text-black rounded px-4 py-2 text-lg active:outline-sky-700 focus-visible:outline-sky-700'
                                        type='text'
                                        name='meet-code'
                                        placeholder='Enter meeting code or link'
                                    />
                                    <JoinMeetButton meetId={meetCode}/>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
