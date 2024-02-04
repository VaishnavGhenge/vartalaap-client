"use client";

import { useEffect, useRef, useState } from "react";
import {
    MicrophoneIcon,
    VideoCameraIcon,
    VideoCameraSlashIcon,
    PhoneXMarkIcon,
} from "@heroicons/react/24/outline";
import { MicrophoneSlashIcon } from "@/cutom_icons/MicrophoneSlashIcon";
import { IUserPreferences } from "@/utils/types";
import { useRecoilState } from "recoil";
import { localAudioTrack, localVideoTrack } from "@/webrtc/tracks";
import { initializeStreamWithTracks, releaseMediaStream } from "@/webrtc/utils";
import { videoConstraints, audioConstraints } from "@/utils/config";
import { releaseVideoTracks } from "@/webrtc/utils";
import { isMeetJoined } from "@/utils/globalStates";

export default function MeetCall({
    meetCode,
    userPreferences,
    updateUserPreferences,
}: {
    meetCode: string;
    userPreferences: IUserPreferences;
    updateUserPreferences: Function;
}) {
    const localVideoRef = useRef<HTMLVideoElement | null>(null);

    const [localVideoTrackState, setLocalVideoTrack] =
        useRecoilState(localVideoTrack);
    const [localAudioTrackState, setLocalAudioTrack] =
        useRecoilState(localAudioTrack);

    const [isMeetJoinedState, setIsMeetJoinedState] =
        useRecoilState(isMeetJoined);

    const init = () => {
        if (localVideoTrackState) {
            initializeStreamWithTracks(localVideoRef.current, [localVideoTrackState]);
            return;
        }

        window.navigator.mediaDevices
            .getUserMedia({
                video: videoConstraints,
                audio: true,
            })
            .then((localStream) => {
                const videoTrack = localStream.getVideoTracks()[0];
                const audioTrack = localStream.getAudioTracks()[0];

                setLocalVideoTrack(videoTrack);
                initializeStreamWithTracks(localVideoRef.current, [videoTrack]);

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
                    const videoTrack = localVideoStream.getVideoTracks()[0];

                    setLocalVideoTrack(videoTrack);
                    initializeStreamWithTracks(localVideoRef.current, [videoTrack]);
                    releaseMediaStream(localVideoStream);

                    updateUserPreferences({ cameraStatus: true });
                });
        } else {
            releaseVideoTracks(localVideoRef.current);
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
                    const audioTrack = localAudioStream.getAudioTracks()[0];

                    setLocalAudioTrack(audioTrack);
                    releaseMediaStream(localAudioStream);

                    updateUserPreferences({ micStatus: true });
                })
                .catch((err) => {
                    console.error(
                        "Error while initializinf audio stream: ",
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

    return (
        <div className='bg-slate-900'>
            <main>
                <div className='h-screen mb-[-80px]'>
                    <div className='p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2'>
                        <div className='relative bg-gray-900 rounded-xl w-[350px] h-[198px] p-4'>
                            <span className='absolute top-4 left-4 z-10 text-sm text-white'>
                                Vaishnav Ghenge
                            </span>

                            <div className='absolute top-0 left-0 w-full h-full rounded-xl bg-gray-600'></div>

                            <video
                                hidden={!userPreferences.cameraStatus}
                                ref={localVideoRef}
                                className='absolute top-0 left-0 w-full h-full rounded-xl'
                                autoPlay
                            ></video>
                        </div>

                        <div className='relative bg-gray-900 rounded-xl w-[350px] h-[198px] p-4'>
                            <span className='absolute top-4 left-4 z-10 text-sm text-white'>
                                Vaishnav Ghenge
                            </span>

                            <div className='absolute top-0 left-0 w-full h-full rounded-xl bg-gray-600'></div>
                        </div>

                        <div className='relative bg-gray-900 rounded-xl w-[350px] h-[198px] p-4'>
                            <span className='absolute top-4 left-4 z-10 text-sm text-white'>
                                Vaishnav Ghenge
                            </span>

                            <div className='absolute top-0 left-0 w-full h-full rounded-xl bg-gray-600'></div>
                        </div>
                    </div>
                </div>

                <div className='bg-slate-800 h-[80px]'>
                    <div className='flex gap-4 justify-center items-center h-full text-white'>
                        {micButton}
                        {cameraButton}

                        {/* end call button */}
                        <div className='absolute z-10 invisible inline-block px-3 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg shadow-sm opacity-0 tooltip dark:bg-gray-700'></div>
                        <div className='rounded-full w-[46px] h-[46px] bg-red-600 flex justify-center items-center hover:cursor-pointer hover:bg-red-700 transition duration-300'>
                            <PhoneXMarkIcon className='w-[23px] h-[23px]' />
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
