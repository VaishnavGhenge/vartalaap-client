"use client";

import Navbar from "@/components/layout/Navbar";
import {IBM_Plex_Sans_Devanagari} from "next/font/google";
import Image from "next/image";
import {ChangeEvent, useEffect, useState} from "react";
import {NewMeetingButton} from "@/components/layout/NewMeetButton";
import {JoinMeetButton} from "@/components/layout/JoinMeetButton";
import {checkBackendHealthy} from "@/utils/common";
import {SideWideAlert} from "@/components/layout/SiteWideAlert";
import {useRecoilState} from "recoil";
import {user} from "@/recoil/auth";

const ibmPlexSansDevanagari = IBM_Plex_Sans_Devanagari({
    weight: "500",
    subsets: ["cyrillic-ext"],
});

export default function Home() {
    const [joinButtonDisabled, setJoinButtonDisabled] = useState(true);
    const [meetCode, setMeetCode] = useState("");
    const [isBackendHealthyState, setBackendHealthy] = useState(true);
    const [loggedInUser, setUser] = useRecoilState(user);

    useEffect(() => {
        checkBackendHealthy()
            .then((isHealthy) => {
                setBackendHealthy(isHealthy);

                const userString = window.localStorage.getItem("user");

                if(userString) {
                    setUser(JSON.parse(userString));
                }
            })
            .catch((error) => {
                setBackendHealthy(false);
            });
    }, []);

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
            {!isBackendHealthyState && <SideWideAlert color="red" message="Server seems offline, please check after some time :)"/>}
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
                                <NewMeetingButton disabled={!isBackendHealthyState || !loggedInUser}/>
                                <div className='flex gap-2'>
                                    <input
                                        value={meetCode}
                                        onChange={onMeetCodeChange}
                                        className="input w-[200px]"
                                        type='text'
                                        name='meet-code'
                                        placeholder='meeting code or link here'
                                    />
                                    <JoinMeetButton disabled={joinButtonDisabled || !isBackendHealthyState || !loggedInUser} meetId={meetCode}/>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
