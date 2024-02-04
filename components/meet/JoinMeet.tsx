"use client";

import Navbar from "@/components/Navbar";
import { useState, useRef, useEffect } from "react";
import {
    VideoCameraSlashIcon,
    MicrophoneIcon,
    VideoCameraIcon,
} from "@heroicons/react/24/outline";
import { MicrophoneSlashIcon } from "@/cutom_icons/MicrophoneSlashIcon";
import { useRecoilState } from "recoil";
import {
    initializeStreamWithTracks,
    printMap,
    streamMap,
    releaseMediaStream,
    releaseVideoTracks,
} from "@/webrtc/utils";
import { localAudioTrack, localVideoTrack } from "@/webrtc/tracks";
import { isMeetJoined } from "@/utils/globalStates";
import { IUserPreferences } from "@/utils/types";
import { videoConstraints } from "@/utils/config";

export default function JoinMeet({
    meetCode,
    userPreferences,
    updateUserPreferences,
}: {
    meetCode: string;
    userPreferences: IUserPreferences;
    updateUserPreferences: Function;
}) {
    const videoRef = useRef<HTMLVideoElement>(null);

    const [localAudioTrackState, setLocalAudioTrack] =
        useRecoilState(localAudioTrack);
    const [localVideoTrackState, setLocalVideoTrack] =
        useRecoilState(localVideoTrack);

    const [isMeetjoinedState, setIsMeetJoined] = useRecoilState(isMeetJoined);

    const init = () => {
        if(localAudioTrackState && localVideoTrackState) {
            return;
        }

        window.navigator.mediaDevices
            .getUserMedia({
                video: videoConstraints,
                audio: true,
            })
            .then((localStream) => {
                streamMap.set(localStream.id, localStream);

                const videoTrack = localStream.getVideoTracks()[0];
                const audioTrack = localStream.getAudioTracks()[0];

                setLocalVideoTrack(videoTrack);
                initializeStreamWithTracks(videoRef.current, [videoTrack]);

                setLocalAudioTrack(audioTrack);

                releaseMediaStream(localStream);
            })
            .catch((err) => {
                console.error("Error occured when initializinf media: ", err);
            });
    };

    useEffect(() => {
        init();
    }, []);

    const toggleCameraButton = (updatedCameraStatus: boolean) => {
        if (updatedCameraStatus && !localVideoTrackState) {
            window.navigator.mediaDevices
                .getUserMedia({
                    video: videoConstraints,
                })
                .then((localVideoStream) => {
                    streamMap.set(localVideoStream.id, localVideoStream);

                    const videoTrack = localVideoStream.getVideoTracks()[0];

                    setLocalVideoTrack(videoTrack);
                    initializeStreamWithTracks(videoRef.current, [videoTrack]);

                    updateUserPreferences({ cameraStatus: true });
                    releaseMediaStream(localVideoStream);
                });
        } else {
            releaseVideoTracks(videoRef.current);
            setLocalVideoTrack(null);

            updateUserPreferences({ cameraStatus: false });
        }
    };

    const toggleMicButton = (updatedMicStatus: boolean) => {
        if (updatedMicStatus && !localAudioTrackState) {
            window.navigator.mediaDevices
                .getUserMedia({
                    audio: true,
                })
                .then((localAudioStream) => {
                    streamMap.set(localAudioStream.id, localAudioStream);

                    const audioTrack = localAudioStream.getAudioTracks()[0];
                    setLocalAudioTrack(audioTrack);

                    updateUserPreferences({ micStatus: true });
                    releaseMediaStream(localAudioStream);
                })
                .catch((err) => {
                    console.error(
                        "Error while initializing audio stream: ",
                        err
                    );
                });
        } else {
            if (localAudioTrackState) {
                localAudioTrackState.stop();
                setLocalAudioTrack(null);

                updateUserPreferences({ micStatus: false });
            } else {
                console.error("Audio track not found");
            }
        }
    };

    const cameraButton = userPreferences.cameraStatus ? (
        <div
            onClick={() => toggleCameraButton(!userPreferences.cameraStatus)}
            className='rounded-full w-[46px] h-[46px] border border-white flex justify-center items-center hover:cursor-pointer hover:bg-slate-400 transition duration-300'
        >
            <VideoCameraIcon className='w-[23px] h-[23px]' />
        </div>
    ) : (
        <div
            onClick={() => toggleCameraButton(!userPreferences.cameraStatus)}
            className='rounded-full w-[46px] h-[46px] bg-red-600 flex justify-center items-center hover:cursor-pointer hover:bg-red-700 transition duration-300'
        >
            <VideoCameraSlashIcon className='w-[23px] h-[23px]' />
        </div>
    );

    const micButton = userPreferences.micStatus ? (
        <div
            onClick={() => toggleMicButton(!userPreferences.micStatus)}
            className='rounded-full w-[46px] h-[46px] border border-white flex justify-center items-center hover:cursor-pointer hover:bg-slate-400 transition duration-300'
        >
            <MicrophoneIcon className='w-[23px] h-[23px]' />
        </div>
    ) : (
        <div
            onClick={() => toggleMicButton(!userPreferences.micStatus)}
            className='rounded-full w-[46px] h-[46px] bg-red-600 flex justify-center items-center hover:cursor-pointer hover:bg-red-700 transition duration-300'
        >
            <MicrophoneSlashIcon className='w-[23px] h-[23px]' />
        </div>
    );

    const onJoinButtonClick = () => {
        if(videoRef.current) {
            const stream = videoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach(track => {
                if(!(track.id === localVideoTrackState?.id)) {
                    track.stop();
                }
            });

            setIsMeetJoined(true);
        }
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
