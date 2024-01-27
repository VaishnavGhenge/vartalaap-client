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
import { localAudioTrack, localVideoTrack } from "@/webrtc/trackStates";
import { initializeStreamWithTracks } from "@/webrtc/utils";
import { videoConstraints, audioConstraints } from "@/utils/config";
import { releaseVideoTracks } from "@/webrtc/utils";
import { isMeetJoined } from "@/utils/globalStates";
import stored from "@/utils/persisitUserPreferences";

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

    const [mediaInitialized, setMediaInitialized] = useState(false);

    const [localVideoTrackState, setLocalVideoTrackState] =
        useRecoilState(localVideoTrack);
    const [localAudioTrackState, setLocalAudioTrackState] =
        useRecoilState(localAudioTrack);
    const [isMeetJoinedState, setIsMeetJoinedState] =
        useRecoilState(isMeetJoined);

    const createLocalVideoStream = async (
        mediaConstraints: MediaStreamConstraints
    ) => {
        const localStream = await navigator.mediaDevices.getUserMedia(
            mediaConstraints
        );

        if (localStream.getVideoTracks().length !== 0) {
            const localVideoTrack = localStream.getVideoTracks()[0];
            initializeStreamWithTracks(localVideoRef.current, [
                localVideoTrack,
            ]);
        }

        if (localStream.getAudioTracks().length !== 0) {
            const audioTrack = localStream.getAudioTracks()[0];
            setLocalAudioTrackState(audioTrack);
        }
    };

    const initializeLocalStream = async ({
        cameraStatus = false,
        micStatus = false,
    }) => {
        if (localVideoTrackState) {
            initializeStreamWithTracks(localVideoRef.current, [
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

    useEffect(() => {
        if (!mediaInitialized) {
            initializeLocalStream(userPreferences);
        }
    }, [userPreferences.cameraStatus, userPreferences.micStatus]);

    useEffect(() => {
        setIsMeetJoinedState(true);
        stored.setIsMeetJoined(true);
    }, []);

    const toggleCameraButton = (cameraStatus: boolean) => {
        const updatedCameraStatus = !cameraStatus;

        if (updatedCameraStatus) {
            if (!mediaInitialized) {
                initializeLocalStream({ cameraStatus: true });

                updateUserPreferences({ cameraStatus: updatedCameraStatus });
                return;
            }

            navigator.mediaDevices
                .getUserMedia({ video: videoConstraints })
                .then((videoStream) => {
                    const videoTrack = videoStream.getVideoTracks()[0];

                    if (localVideoRef.current) {
                        const stream = localVideoRef.current
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
                    console.error("Error while startign camera: ", error);
                });
        } else {
            if (localVideoRef.current) {
                const stream = localVideoRef.current.srcObject as MediaStream;
                releaseVideoTracks(stream);

                updateUserPreferences({ cameraStatus: updatedCameraStatus });
            }
        }
    };

    const toggleMicButton = (micStatus: boolean) => {
        const updatedMicStatus = !micStatus;

        if (updatedMicStatus) {
            if (!mediaInitialized) {
                initializeLocalStream({ micStatus: true });

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
