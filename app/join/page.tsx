"use client";

import Navbar from "@/components/Navbar";
import { useState, useRef, useEffect, useCallback } from "react";
import {
    VideoCameraSlashIcon,
    MicrophoneIcon,
    VideoCameraIcon,
} from "@heroicons/react/24/outline";
import { useSearchParams, useRouter } from "next/navigation";

import stored, { UserPreferences } from "@/utils/persisitUserPreferences";
import Image from "next/image";
import { useDebounce } from "@/cutom_hooks/debounce";

export default function JoinMeet() {
    const searchParams = useSearchParams();
    const router = useRouter();

    const [meetCode, setMeetCode] = useState(searchParams.get("code") || "");
    const videoRef = useRef<HTMLVideoElement>(null);
    const mediaStreamRef = useRef<MediaStream| null>(null);
    const [mediaInitialized, setMediaInitialized] = useState(false);
    const [userPreferences, setUserPreferences] = useState<UserPreferences>({
        micStatus: false,
        cameraStatus: false,
    });

    const videoConstraints = {
        width: 1280,
        height: 720,
        facingMode: "user",
    };
    const audioConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
    };

    const startMedia = ({cameraStatus = false, micStatus = false}) => {
        let mediaConstraints: any = {};

        console.log('startMedia');

        if(cameraStatus && micStatus) {
            mediaConstraints = {video: videoConstraints, audio: audioConstraints};
        } else if(cameraStatus) {
            mediaConstraints.video = videoConstraints;
        } else if(micStatus) {
            mediaConstraints.audio = audioConstraints;
        }

        if(Object.keys(mediaConstraints).length !== 0) {
            navigator.mediaDevices.getUserMedia(mediaConstraints)
            .then((localStream: MediaStream) => {
                console.log(localStream);
                mediaStreamRef.current = localStream;
                
                if(videoRef.current) {
                    videoRef.current.srcObject = localStream;
                }
                setMediaInitialized(true);
            });
        }
    }

    const stopMedia = () => {
        const localStream = mediaStreamRef;
        const tracks = localStream.current?.getTracks();
        tracks?.forEach((track: MediaStreamTrack) => {
            track.stop();
            mediaStreamRef.current?.removeTrack(track);
        });
    }

    // Retrieve user preferences from localStorage
    useEffect(() => {
        const userPreferences = stored.getMeetPreferences();
        setUserPreferences(userPreferences);

        console.log("user preferences restored: ", userPreferences);

        startMedia(userPreferences);

        return () => {
            stopMedia();
        }
    }, []);

    const updateUserPreferences = (preferences: {
        micStatus?: boolean;
        cameraStatus?: boolean;
    }) => {
        const updatedPreferences = {
            ...userPreferences,
            ...preferences,
        } as UserPreferences;

        // console.log("newely formed preferences: ", updatedPreferences);

        stored.setMeetPreferences(updatedPreferences);
        setUserPreferences(updatedPreferences);
    };

    const toggleCameraButton = (cameraStatus: boolean) => {
        const newCameraStatus = !cameraStatus;

        if(newCameraStatus) {
            if(!mediaInitialized) {
                startMedia({cameraStatus: true});
                updateUserPreferences({cameraStatus: newCameraStatus});
                return;
            }

            navigator.mediaDevices.getUserMedia({video: videoConstraints})
            .then((videoStream) => {
                const videoTrack = videoStream.getVideoTracks()[0];

                mediaStreamRef.current?.addTrack(videoTrack);
                updateUserPreferences({cameraStatus: newCameraStatus});
            });
        } else {
            const videoTracks = mediaStreamRef.current?.getVideoTracks();
            console.warn('total video tracks: ' + videoTracks?.length);
            videoTracks?.forEach((track) => {
                track.stop();
                mediaStreamRef.current?.removeTrack(track);
                console.log(track.id + ' video track stopped');
            });
            updateUserPreferences({cameraStatus: newCameraStatus});
        }
        
    };

    const toggleMicButton = (micStatus: boolean) => {
        const newMicStatus = !micStatus;

        if(newMicStatus) {
            if(!mediaInitialized) {
                startMedia({micStatus: true});
                updateUserPreferences({micStatus: newMicStatus});
                return;
            }

            navigator.mediaDevices.getUserMedia({audio: audioConstraints})
                .then((audioStream) => {
                    const audioTrack = audioStream.getAudioTracks()[0];
                    mediaStreamRef.current?.addTrack(audioTrack);
                    updateUserPreferences({micStatus: newMicStatus});
                });
        } else {
            const audioTracks = mediaStreamRef.current?.getAudioTracks();
            console.warn('total audio tracks: ' + audioTracks?.length);
            audioTracks?.forEach((track) => {
                track.stop();
                mediaStreamRef.current?.removeTrack(track);
                console.log(track.id + ' audio track stopped');
            });
            updateUserPreferences({micStatus: newMicStatus});
        }
    };

    const cameraButton = userPreferences.cameraStatus ? (
        <div
            onClick={() => toggleCameraButton(userPreferences.cameraStatus)}
            className='rounded-full w-[56px] h-[56px] border border-white flex justify-center items-center hover:cursor-pointer hover:bg-slate-400 transition duration-300'
        >
            <VideoCameraIcon className='w-[24px] h-[24px]' />
        </div>
    ) : (
        <div
            onClick={() => toggleCameraButton(userPreferences.cameraStatus)}
            className='rounded-full w-[56px] h-[56px] bg-red-600 flex justify-center items-center hover:cursor-pointer hover:bg-red-700 transition duration-300'
        >
            <VideoCameraSlashIcon className='w-[24px] h-[24px]' />
        </div>
    );

    const micButton = userPreferences.micStatus ? (
        <div
            onClick={() => toggleMicButton(userPreferences.micStatus)}
            className='rounded-full w-[56px] h-[56px] border border-white flex justify-center items-center hover:cursor-pointer hover:bg-slate-400 transition duration-300'
        >
            <MicrophoneIcon className='w-[24px] h-[24px]' />
        </div>
    ) : (
        <div
            onClick={() => toggleMicButton(userPreferences.micStatus)}
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
        router.push(`/${meetCode}`);
    };

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
