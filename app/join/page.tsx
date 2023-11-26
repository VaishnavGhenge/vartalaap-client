"use client";

import Navbar from "@/components/Navbar";
import { useState, useRef, useEffect, useCallback } from "react";
import {
    VideoCameraSlashIcon,
    MicrophoneIcon,
    VideoCameraIcon,
} from "@heroicons/react/24/outline";
import { useSearchParams, useRouter } from "next/navigation";

import {
    setUserMeetPreferences,
    getUserMeetPreferences,
    UserPreferences,
} from "@/utils/userPreferences";
import Image from "next/image";

export default function JoinMeet() {
    const searchParams = useSearchParams();
    const router = useRouter();

    const [meetCode, setMeetCode] = useState(searchParams.get("code") || "");
    const videoRef = useRef<HTMLVideoElement>(null);
    const [stream, setStream] = useState<MediaStream | null>();
    const [userPreferences, setUserPreferences] = useState<UserPreferences>({
        micStatus: false,
        cameraStatus: false,
    });

    const [videoConstraints, setVideoConstraints] = useState({
        width: 1280,
        height: 720,
        facingMode: "user",
    }); // Adjust the width and height as needed
    const [audioConstraints, setAudioConstraints] = useState({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
    });

    // Retrieve user preferences from localStorage
    useEffect(() => {
        const userPreferences = getUserMeetPreferences();
        setUserPreferences(userPreferences);

        console.log("user preferences restored: ", userPreferences);
    }, []);

    const updateUserPreferences = (preferences: {
        micStatus?: boolean;
        cameraStatus?: boolean;
    }) => {
        const updatedPreferences = {
            ...userPreferences,
            ...preferences,
        } as UserPreferences;

        console.log("newely formed preferences: ", updatedPreferences);

        setUserMeetPreferences(updatedPreferences);
        setUserPreferences(updatedPreferences);
    };

    // Start camera and mic according to user preferences
    const startMedia = useCallback(async () => {
        if (!userPreferences.cameraStatus && !userPreferences.micStatus) return;

        try {
            const streamLocal = await navigator.mediaDevices.getUserMedia({
                video: userPreferences.cameraStatus
                    ? videoConstraints
                    : userPreferences.cameraStatus,
                audio: userPreferences.micStatus
                    ? audioConstraints
                    : userPreferences.micStatus,
            });

            setStream(streamLocal);
            console.log("stream local", streamLocal);

            if (videoRef.current) {
                videoRef.current.srcObject = streamLocal;
            }
        } catch (error) {
            console.log(error);
        }
    }, [
        userPreferences.cameraStatus,
        userPreferences.micStatus,
        audioConstraints,
        videoConstraints,
    ]);

    // TODO: fix stopMedia(), not working (stream is undesfined for some reason)
    // Stop camera and mic
    const stopMedia = useCallback(() => {
        console.log('inside stop media');
        console.log(stream)
        const tracks = stream?.getTracks();
        console.log(tracks)
        if (tracks) {
            tracks.forEach((track: MediaStreamTrack) => {
                console.log('tracks: ', track)
                track.stop();
            });
        }
    }, []);

    // Start camera and audio streaming after loaded
    useEffect(() => {
        startMedia();

        return () => {
            stopMedia();
        };
    }, [userPreferences.micStatus, userPreferences.cameraStatus]);

    // Stop browser camera
    const stopCamera = () => {
        const videoTracks = stream?.getVideoTracks();
        if (videoTracks) {
            videoTracks.forEach((track: MediaStreamTrack) => {
                track.stop();
            });
        }
    };

    const stopMic = () => {
        const audioTracks = stream?.getAudioTracks();
        if (audioTracks) {
            audioTracks.forEach((track: MediaStreamTrack) => {
                track.stop();
            });
        }
    };

    const toggleCameraButton = () => {
        // If video is on then turn it off
        if (userPreferences.cameraStatus) {
            // turn of stream
            stopCamera();
        } else {
            // switch on stream
            startMedia();
        }
        updateUserPreferences({ cameraStatus: !userPreferences.cameraStatus });
    };

    const toggleMicButton = () => {
        if (userPreferences.micStatus) {
            stopMic();
        } else {
            startMedia();
        }
        updateUserPreferences({ micStatus: !userPreferences.micStatus });
    };

    const cameraButton = userPreferences.cameraStatus ? (
        <div
            onClick={toggleCameraButton}
            className='rounded-full w-[56px] h-[56px] border border-white flex justify-center items-center hover:cursor-pointer hover:bg-slate-400 transition duration-300'
        >
            <VideoCameraIcon className='w-[24px] h-[24px]' />
        </div>
    ) : (
        <div
            onClick={toggleCameraButton}
            className='rounded-full w-[56px] h-[56px] bg-red-600 flex justify-center items-center hover:cursor-pointer hover:bg-red-700 transition duration-300'
        >
            <VideoCameraSlashIcon className='w-[24px] h-[24px]' />
        </div>
    );

    const micButton = userPreferences.micStatus ? (
        <div
            onClick={toggleMicButton}
            className='rounded-full w-[56px] h-[56px] border border-white flex justify-center items-center hover:cursor-pointer hover:bg-slate-400 transition duration-300'
        >
            <MicrophoneIcon className='w-[24px] h-[24px]' />
        </div>
    ) : (
        <div
            onClick={toggleMicButton}
            className='rounded-full w-[56px] h-[56px] bg-red-600 flex justify-center items-center hover:cursor-pointer hover:bg-red-700 transition duration-300'
        >
            <Image
                src='/static/icons/microphone-off.svg'
                width={24}
                height={24}
                alt='Micorphone icon'
            />
        </div>
    );

    // TODO: Invistigate useRouter(), why its not working?
    const onJoinButtonClick = () => {
        stopMedia();
        // router.push(`/${meetCode}`);
    }

    return (
        <div>
            <Navbar />
            <main className='h-screen mt-[-82px]'>
                <div className='container mx-auto h-full'>
                    <div className='grid grid-cols-3 gap-4 h-full'>
                        <div className='col-span-2 flex flex-col items-center justify-center text-white h-full'>
                            <div className='relative bg-gray-900 rounded-xl w-[750px] h-[422px] p-6'>
                                <span className='absolute top-6 left-6 z-10'>
                                    Vaishnav Ghenge
                                </span>
                                <span
                                    hidden={userPreferences.cameraStatus}
                                    className='text-2xl absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2'
                                >
                                    Camera is off
                                </span>
                                <div className='absolute bottom-6 left-1/2 transform -translate-x-1/2 flex gap-4 justify-center items-center z-10'>
                                    {micButton}
                                    {cameraButton}
                                </div>
                                <video
                                    hidden={!userPreferences.cameraStatus}
                                    ref={videoRef}
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
                                <button
                                    className='bg-sky-700 rounded-full text-white px-6 py-3 hover:cursor-pointer hover:bg-sky-800 transition duration-300'
                                    type='button'
                                    onClick={onJoinButtonClick}
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
