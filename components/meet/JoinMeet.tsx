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

import { videoConstraints, audioConstraints } from "@/utils/config";

import { localVideoTrack, localAudioTrack } from "@/webrtc/trackStates";
import { releaseVideoTracks, initializeStreamWithTracks } from "@/webrtc/utils";
import { isMeetJoined } from "@/utils/globalStates";
import { IUserPreferences } from "@/utils/types";

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

    const [localAudioTrackState, setLocalAudioTrackState] =
        useRecoilState(localAudioTrack);
    const [localVideoTrackState, setLocalVideoTrackState] =
        useRecoilState(localVideoTrack);

    const [isMeetJoinedState, setMediaJoinedState] =
        useRecoilState(isMeetJoined);
    const [mediaInitialized, setMediaInitialized] = useState(false);

    const createLocalVideoStream = async (
        mediaConstraints: MediaStreamConstraints
    ) => {
        const localStream = await navigator.mediaDevices.getUserMedia(
            mediaConstraints
        );

        if (localStream.getVideoTracks().length !== 0) {
            const localVideoTrack = localStream.getVideoTracks()[0];
            initializeStreamWithTracks(videoRef.current, [localVideoTrack]);
            setLocalVideoTrackState(localVideoTrack);
        }

        if (localStream.getAudioTracks().length !== 0) {
            const audioTrack = localStream.getAudioTracks()[0];
            setLocalAudioTrackState(audioTrack);
        }
    };

    const initializeStream = async ({
        cameraStatus = false,
        micStatus = false,
    }) => {
        if (localVideoTrackState) {
            initializeStreamWithTracks(videoRef.current, [
                localVideoTrackState,
            ]);

            setMediaInitialized(true);
            return;
        }

        let mediaConstraints: MediaStreamConstraints = {};

        if (cameraStatus && micStatus) {
            mediaConstraints = {
                video: videoConstraints,
                audio: audioConstraints,
            };
        } else if (cameraStatus) {
            mediaConstraints.video = videoConstraints;
        } else if (micStatus) {
            mediaConstraints.audio = audioConstraints;
        }

        if (Object.keys(mediaConstraints).length !== 0) {
            await createLocalVideoStream(mediaConstraints);

            setMediaInitialized(true);
        }
    };

    // Retrieve user preferences from localStorage
    useEffect(() => {
        if (!mediaInitialized) {
            initializeStream(userPreferences);
        }
    }, [userPreferences.cameraStatus, userPreferences.micStatus]);

    const toggleCameraButton = (cameraStatus: boolean) => {
        const updatedCameraStatus = !cameraStatus;

        if (updatedCameraStatus) {
            if (!mediaInitialized) {
                initializeStream({ cameraStatus: true });

                updateUserPreferences({ cameraStatus: updatedCameraStatus });
                return;
            }

            navigator.mediaDevices
                .getUserMedia({ video: videoConstraints })
                .then((videoStream) => {
                    const videoTrack = videoStream.getVideoTracks()[0];

                    if (videoRef.current) {
                        const stream = videoRef.current
                            .srcObject as MediaStream;

                        // releaseVideoTracks(stream);

                        stream.addTrack(videoTrack);
                        setLocalVideoTrackState(videoTrack);
                    }

                    updateUserPreferences({
                        cameraStatus: updatedCameraStatus,
                    });

                    setMediaInitialized(true);
                })
                .catch((error) => {
                    console.error("Error while starting camera: ", error);
                });
        } else {
            if (videoRef.current) {
                const stream = videoRef.current.srcObject as MediaStream;
                releaseVideoTracks(stream);
                setLocalVideoTrackState(null);

                updateUserPreferences({ cameraStatus: updatedCameraStatus });
            }
        }
    };

    const toggleMicButton = (micStatus: boolean) => {
        const updatedMicStatus = !micStatus;

        if (updatedMicStatus) {
            if (!mediaInitialized) {
                initializeStream({ micStatus: true });

                updateUserPreferences({ micStatus: updatedMicStatus });
                return;
            }

            navigator.mediaDevices
                .getUserMedia({ audio: audioConstraints })
                .then((audioStream) => {
                    const audioTrack = audioStream.getAudioTracks()[0];
                    setLocalAudioTrackState(audioTrack);

                    updateUserPreferences({ micStatus: updatedMicStatus });
                });
        } else {
            if (localAudioTrackState) {
                localAudioTrackState.stop();
                setLocalAudioTrackState(null);

                updateUserPreferences({ micStatus: updatedMicStatus });
            }
        }
    };

    const cameraButton = userPreferences.cameraStatus ? (
        <div
            onClick={() => toggleCameraButton(userPreferences.cameraStatus)}
            className='rounded-full w-[46px] h-[46px] border border-white flex justify-center items-center hover:cursor-pointer hover:bg-slate-400 transition duration-300'
        >
            <VideoCameraIcon className='w-[23px] h-[23px]' />
        </div>
    ) : (
        <div
            onClick={() => toggleCameraButton(userPreferences.cameraStatus)}
            className='rounded-full w-[46px] h-[46px] bg-red-600 flex justify-center items-center hover:cursor-pointer hover:bg-red-700 transition duration-300'
        >
            <VideoCameraSlashIcon className='w-[23px] h-[23px]' />
        </div>
    );

    const micButton = userPreferences.micStatus ? (
        <div
            onClick={() => toggleMicButton(userPreferences.micStatus)}
            className='rounded-full w-[46px] h-[46px] border border-white flex justify-center items-center hover:cursor-pointer hover:bg-slate-400 transition duration-300'
        >
            <MicrophoneIcon className='w-[23px] h-[23px]' />
        </div>
    ) : (
        <div
            onClick={() => toggleMicButton(userPreferences.micStatus)}
            className='rounded-full w-[46px] h-[46px] bg-red-600 flex justify-center items-center hover:cursor-pointer hover:bg-red-700 transition duration-300'
        >
            <MicrophoneSlashIcon className='w-[23px] h-[23px]' />
        </div>
    );

    const onJoinButtonClick = () => {
        setMediaJoinedState(true);
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
