"use client";

import { currentPeer } from "@/utils/globalStates";
import Navbar from "../components/Navbar";
import { IBM_Plex_Sans_Devanagari } from "next/font/google";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ChangeEvent, useState } from "react";
import { useRecoilState } from "recoil";

const ibmPlexSansDevanagari = IBM_Plex_Sans_Devanagari({
    weight: "500",
    subsets: ["cyrillic-ext"],
});

export default function Home() {
    const [joinButtonDisabled, setJoinButtonDisabled] = useState(true);
    const [meetCode, setMeetCode] = useState("");
    const router = useRouter();

    const onMeetCodeChange = (event: ChangeEvent<HTMLInputElement>) => {
        setMeetCode(event.target.value);
        if (event.target.value.length > 0) {
            setJoinButtonDisabled(false);
        } else {
            setJoinButtonDisabled(true);
        }
    };

    const onNewMeetButtonClick = () => {
        router.push(`/${meetCode}`);
    };

    const onJoinButtonClick = () => {
        router.push(`/${meetCode}`);
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
                                <button
                                    className='bg-sky-700 px-4 py-2 rounded text-white hover:bg-sky-800 transition duration-300'
                                    type='button'
                                    onClick={onNewMeetButtonClick}
                                >
                                    <span>New meeting</span>
                                </button>
                                <div className='flex gap-2'>
                                    <input
                                        value={meetCode}
                                        onChange={onMeetCodeChange}
                                        className='bg-slate-300 text-black rounded px-4 py-2 text-lg active:outline-sky-700 focus-visible:outline-sky-700'
                                        type='text'
                                        name='meet-code'
                                        placeholder='Enter meeting code or link'
                                    />
                                    <button
                                        disabled={joinButtonDisabled}
                                        type='button'
                                        className='text-sky-700 px-3 py-2 rounded hover:bg-sky-100 hover:cursor-pointer disabled:text-gray-400'
                                        onClick={onJoinButtonClick}
                                    >
                                        Join
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
