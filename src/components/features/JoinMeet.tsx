"use client";

import Navbar from "@/src/components/ui/Navbar";
import {useState} from "react";
import {MicButton} from "@/src/components/ui/MicButton";
import {CameraButton} from "@/src/components/ui/CameraButton";
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from "@/src/components/ui/tooltip";
import { Input } from "@/src/components/ui/input";

export default function JoinMeet() {
    const meetCode = "1bc";
    const [isCopy, setIsCopy] = useState(true);

    const onClickCopyMeetCode = () => {
        if (!isCopy) {
            return;
        }
    }

    return (
        <div>
            <Navbar/>
            <main className='mt-[82px]'>
                <div className='container mx-auto h-full'>
                    <div className='grid grid-cols-2 md:grid-cols-3 gap-4 h-full'>
                        <div className='col-span-2 flex flex-col items-center justify-center text-white h-full'>
                            <div
                                className='relative bg-gray-900 rounded-xl p-6'
                            >
                                <span className='absolute top-6 left-6 z-10'>
                                    Vaishnav Ghenge
                                </span>

                                <span
                                    className='text-2xl absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2'
                                >
                                    Camera is off
                                </span>

                                <div
                                    className='absolute bottom-6 left-1/2 transform -translate-x-1/2 flex gap-4 justify-center items-center z-10'
                                >
                                    <MicButton
                                        onClickFn={() => {
                                        }}
                                        action="open"
                                    />
                                    <CameraButton
                                        onClickFn={() => {
                                        }}
                                        action="open"
                                    />
                                </div>

                                <video
                                    className='absolute top-0 left-0 w-full h-full rounded-xl'
                                    autoPlay
                                ></video>
                            </div>
                        </div>
                        <div className='col-span-1 flex flex-col items-start justify-center h-full'>
                            <div>
                                <div className='mb-10'>
                                    <h2 className='mb-6 text-2xl'>
                                        Ready to join?
                                    </h2>

                                    <p className='text-xs'>
                                        No one else is here
                                    </p>
                                </div>

                                <div
                                    className="flex items-center justify-center bg-slate-200 text-slate-900 px-2 py-2 mb-4 rounded">
                                    <p className="text-sm mr-2">{meetCode}</p>
                                    <div className="flex items-center justify-center text-sky-700"
                                         onClick={onClickCopyMeetCode}>
                                        <TooltipProvider>
                                            <Tooltip>
                                                <TooltipTrigger>
                                                    {isCopy ?
                                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none"
                                                             viewBox="0 0 24 24"
                                                             strokeWidth={1.3} stroke="currentColor"
                                                             className="w-5 h-5">
                                                            <path strokeLinecap="round" strokeLinejoin="round"
                                                                  d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75"/>
                                                        </svg> :
                                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none"
                                                             viewBox="0 0 24 24" strokeWidth={1.3} stroke="currentColor"
                                                             className="w-5 h-5">
                                                            <path strokeLinecap="round" strokeLinejoin="round"
                                                                  d="m4.5 12.75 6 6 9-13.5"/>
                                                        </svg>
                                                    }
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <p>{isCopy ? "Copy to clipboard" : "Copied!"}</p>
                                                </TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>
                                    </div>
                                </div>

                                <Input placeholder="Enter your name"/>

                                <button
                                    className='text-base bg-sky-700 rounded-full text-white px-6 py-3 hover:cursor-pointer hover:bg-sky-800 transition duration-300'
                                    type='button'
                                    onClick={() => {
                                    }}
                                >
                                    Join Now
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
