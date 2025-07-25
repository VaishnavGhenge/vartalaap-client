"use client";

import Navbar from "@/src/components/ui/Navbar";
import {useEffect, useState, useRef} from "react";
import {MicButton} from "@/src/components/ui/MicButton";
import {CameraButton} from "@/src/components/ui/CameraButton";
import {CustomTooltip} from "@/src/components/ui/CustomTooltip";
import { Input } from "@/src/components/ui/input";
import {useParams, useRouter} from "next/navigation";
import {Button} from "@/src/components/ui/button";
import { usePeerStore } from "@/src/stores/peer";
import { useMeetStore } from "@/src/stores/meet";
import { useJoinMeetStore } from "@/src/stores/joinMeet";

export default function JoinMeet() {
    const params = useParams<{meetCode: string}>();
    const videoRef = useRef<HTMLVideoElement>(null);

    const [meetCode, setMeetCode] = useState("");
    const [isCopy, setIsCopy] = useState(true);

    const { 
        localStream, 
        isInitialized, 
        initializeCamera, 
        stopCamera,
        clearAll 
    } = usePeerStore();
    
    const { 
        isMuted, 
        isVideoOff, 
        toggleMute, 
        toggleVideo 
    } = useMeetStore();
    
    const {
        userName,
        setUserName
    } = useJoinMeetStore();

    useEffect(() => {
        setMeetCode(params.meetCode);
    }, [params]);

    useEffect(() => {
        return () => {
            clearAll();
        };
    }, [clearAll]);

    useEffect(() => {
        if (localStream && videoRef.current) {
            videoRef.current.srcObject = localStream;
        }
    }, [localStream]);

    const handleCameraToggle = async () => {
        if (isVideoOff) {
            const stream = await initializeCamera();
            if (stream && videoRef.current) {
                videoRef.current.srcObject = stream;
            }
        } else {
            stopCamera();
            if (videoRef.current) {
                videoRef.current.srcObject = null;
            }
        }
        toggleVideo();
    };

    const handleMicToggle = () => {
        if (localStream) {
            const audioTracks = localStream.getAudioTracks();
            audioTracks.forEach(track => {
                track.enabled = isMuted;
            });
        }
        toggleMute();
    };

    const handleJoinMeet = async () => {
        if (!localStream && !isVideoOff) {
            await initializeCamera();
        }
    };

    const copyToClipboard = () => {
        void navigator.clipboard.writeText(meetCode);
        setIsCopy(false);
        setTimeout(() => setIsCopy(true), 2000);
    };

    return (
        <div>
            <Navbar/>
            <main>
                <div className='container mx-auto h-full'>
                    <div className='grid grid-cols-1 lg:grid-cols-3 gap-6 h-full min-h-[calc(100vh-120px)]'>
                        <div className='lg:col-span-2 flex flex-col items-center justify-center text-white'>
                            <div className='relative bg-gray-900 rounded-xl overflow-hidden w-full max-w-3xl' style={{aspectRatio: '16/9'}}>
                                <span className='absolute top-4 left-4 z-10 bg-black bg-opacity-60 px-3 py-1 rounded-md text-sm font-medium'>
                                    {userName || 'Your Name'}
                                </span>

                                {isVideoOff && (
                                    <div className='absolute inset-0 flex items-center justify-center bg-gray-800'>
                                        <div className='text-center'>
                                            <div className='w-16 h-16 bg-gray-600 rounded-full flex items-center justify-center mx-auto mb-3'>
                                                <svg className='w-8 h-8 text-gray-400' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                                                    <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' />
                                                </svg>
                                            </div>
                                            <span className='text-lg text-gray-300'>Camera is off</span>
                                        </div>
                                    </div>
                                )}

                                <div className='absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-3 justify-center items-center z-10'>
                                    <MicButton
                                        onClickFn={handleMicToggle}
                                        action={isMuted ? "close" : "open"}
                                    />
                                    <CameraButton
                                        onClickFn={handleCameraToggle}
                                        action={isVideoOff ? "close" : "open"}
                                    />
                                </div>

                                <video
                                    ref={videoRef}
                                    className='absolute inset-0 w-full h-full object-cover'
                                    autoPlay
                                    muted
                                    playsInline
                                ></video>
                            </div>
                        </div>
                        <div className='lg:col-span-1 flex flex-col justify-center'>
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
                                    <CustomTooltip content={isCopy ? "Copy to clipboard" : "Copied!"}>
                                        <button 
                                            className="flex items-center justify-center text-sky-700 cursor-pointer p-1 hover:bg-slate-300 rounded"
                                            onClick={copyToClipboard}
                                        >
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
                                        </button>
                                    </CustomTooltip>
                                </div>

                                <Input 
                                    placeholder="Enter your name" 
                                    value={userName}
                                    onChange={(e) => setUserName(e.target.value)}
                                    className="mb-4"
                                />

                                <Button 
                                    onClick={handleJoinMeet}
                                    disabled={!userName.trim()}
                                >
                                    Join now
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
