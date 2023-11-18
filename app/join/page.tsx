"use client";

import Navbar from "@/components/Navbar/Navbar";
import { useState, useRef, useEffect } from "react";
import { VideoCameraSlashIcon, MicrophoneIcon, VideoCameraIcon } from "@heroicons/react/24/outline";
import { useSearchParams } from "next/navigation";
import VoiceIndicator from "@/components/VoiceIndicator";

export default function Meet() {
    const searchParams = useSearchParams();
    
    const [meetCode, setMeetCode] = useState(searchParams.get('code') || '');
    const videoRef = useRef<HTMLVideoElement>(null);
    const [videoConstraints, setVideoConstraints] = useState({ width: 1280, height: 720, facingMode: 'user' }); // Adjust the width and height as needed
    const [audioConstraints, setAudioConstraints] = useState({ echoCancellation: true, noiseSuppression: true, autoGainControl: true });
    const [isVideoOn, setIsVideoOn] = useState(true);

    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: videoConstraints,
                // audio: audioConstraints,
            });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }    
        } catch (error) {
            console.log(error);
        }  
    };

    const stopCamera = () => {
        if (videoRef.current && videoRef.current.srcObject) {
            const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
            tracks.forEach((track: MediaStreamTrack) => {
                track.stop();
            });
        }
    }

    useEffect(() => {
        startCamera();

        return () => {
            startCamera();
        };
    }, []);

    const toggleCamera = () => {
        // is video is on then turn it off
        if(isVideoOn) {
            // turn of stream
            stopCamera();
        } else {
            // switch on stream
            startCamera();
        }

        setIsVideoOn(!isVideoOn);
    }

    const cameraIcon = isVideoOn ? 
    (<div onClick={toggleCamera} className='rounded-full w-[56px] h-[56px] border border-white flex justify-center items-center hover:cursor-pointer hover:bg-slate-400 transition duration-300'>
        <VideoCameraIcon className='w-[24px] h-[24px]' />
    </div>)
    : 
    (<div onClick={toggleCamera} className='rounded-full w-[56px] h-[56px] bg-red-600 flex justify-center items-center hover:cursor-pointer hover:bg-red-700 transition duration-300'>
        <VideoCameraSlashIcon className='w-[24px] h-[24px]' />
    </div>);

    return (
        <div>
            <Navbar />
            <main className='h-screen mt-[-82px]'>
                <div className='container mx-auto h-full'>
                    <div className='grid grid-cols-3 gap-4 h-full'>
                        <div className='col-span-2 flex flex-col items-center justify-center text-white h-full'>
                            <div className='relative bg-gray-900 rounded-xl w-[750px] h-[422px] p-6'>
                                <span className='absolute top-6 left-6 z-10'>Vaishnav Ghenge</span>
                                <span hidden={isVideoOn} className='text-2xl absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2'>Camera is off</span>
                                <div className='absolute bottom-6 left-1/2 transform -translate-x-1/2 flex gap-4 justify-center items-center z-10'>
                                    <div className='rounded-full w-[56px] h-[56px] border border-white flex justify-center items-center hover:cursor-pointer hover:bg-slate-400 transition duration-300'>
                                        <MicrophoneIcon className='w-[24px] h-[24px]' />
                                    </div>
                                    {cameraIcon}
                                </div>
                                <video hidden={!isVideoOn} ref={videoRef} className='absolute top-0 left-0 w-full h-full rounded-xl' autoPlay></video>
                            </div>
                        </div>
                        <div className='col-span-1 flex flex-col items-start justify-center h-full'>
                            <div>
                                <div className='mb-10'>
                                    <h2 className='mb-6 text-2xl'>Ready to join?</h2>
                                    <p className='text-center text-xs'>No one else is here</p>
                                </div>
                                <button className='bg-sky-700 rounded-full text-white px-6 py-3 hover:cursor-pointer hover:bg-sky-800 transition duration-300' type='button'>Join Now</button>
                                <VoiceIndicator />
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
