"use client";

import {useEffect, useState, useRef} from "react";
import {User, Copy, Check} from "lucide-react";
import {MicButton} from "@/src/components/ui/MicButton";
import {CameraButton} from "@/src/components/ui/CameraButton";
import {CustomTooltip} from "@/src/components/ui/CustomTooltip";
import {Input} from "@/src/components/ui/input";
import {useParams} from "next/navigation";
import {Button} from "@/src/components/ui/button";
import {usePeerStore} from "@/src/stores/peer";
import {useMeetStore} from "@/src/stores/meet";
import {useJoinMeetStore} from "@/src/stores/joinMeet";

export default function JoinMeet() {
    const params = useParams<{ meetCode: string }>();
    const videoRef = useRef<HTMLVideoElement>(null);

    const [meetCode, setMeetCode] = useState("");
    const [isCopy, setIsCopy] = useState(true);

    const {
        localStream,
        initializeCamera,
        stopCamera
    } = usePeerStore();

    const {
        isMuted,
        isVideoOff,
        toggleMute,
        toggleVideo
    } = useMeetStore();

    const {
        userName,
        setUserName,
        setHasJoinedMeet
    } = useJoinMeetStore();

    useEffect(() => {
        setMeetCode(params.meetCode);
    }, [params]);


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
        if (!userName.trim()) return;

        if (!localStream && !isVideoOff) {
            await initializeCamera();
        }

        // Set user as joined to switch to the MeetCall view
        setHasJoinedMeet(true);
    };

    const copyToClipboard = () => {
        void navigator.clipboard.writeText(meetCode);
        setIsCopy(false);
        setTimeout(() => setIsCopy(true), 2000);
    };

    return (
        <main>
            <div className='container p-4 mx-auto h-full'>
                <div className='grid grid-cols-1 lg:grid-cols-3 gap-6 h-full min-h-[calc(100vh-120px)]'>
                    <div className='lg:col-span-2 flex flex-col items-center justify-center text-white'>
                        <div className='relative bg-gray-900 rounded-xl overflow-hidden w-full max-w-3xl'
                             style={{aspectRatio: '16/9'}}>
                                <span
                                    className='absolute top-4 left-4 z-10 bg-black bg-opacity-60 px-3 py-1 rounded-md text-sm font-medium'>
                                    {userName || 'Your Name'}
                                </span>

                            {isVideoOff && (
                                <div className='absolute inset-0 flex items-center justify-center bg-gray-800'>
                                    <div className='text-center'>
                                        <div
                                            className='w-16 h-16 bg-gray-600 rounded-full flex items-center justify-center mx-auto mb-3'>
                                            <User className='w-8 h-8 text-gray-400'/>
                                        </div>
                                        <span className='text-lg text-gray-300'>Camera is off</span>
                                    </div>
                                </div>
                            )}

                            <div
                                className='absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-3 justify-center items-center z-10'>
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
                                            <Copy className="w-5 h-5"/> :
                                            <Check className="w-5 h-5"/>
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

    );
}
