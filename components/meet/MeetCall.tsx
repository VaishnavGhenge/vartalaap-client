"use client";

import {useCallback, useEffect, useRef} from "react";
import {
    PhoneXMarkIcon,
} from "@heroicons/react/24/outline";
import {IUserPreferences} from "@/utils/types";
import {useRecoilState} from "recoil";
import {localAudioTrack, localVideoTrack} from "@/webrtc/recoilStates";
import {
    audioStreamTrackMap,
    getLocalVideoStreamTrack,
    releaseMediaStream,
    turnOffCamera,
    turnOffMic,
    videoStreamTrackMap,
} from "@/webrtc/utils";
import {videoConstraints, audioConstraints} from "@/utils/config";
import {Meet} from "@/webrtc/webrtc";
import {MicButton} from "@/components/layout/MicButton";
import {CameraButton} from "@/components/layout/CameraButton";

export default function MeetCall(
    {
        meetCode,
        userPreferences,
        updateUserPreferences,
        meet,
    }: {
        meetCode: string;
        userPreferences: IUserPreferences;
        updateUserPreferences: Function;
        meet: Meet | null;
    }) {
    const localVideoRef = useRef<HTMLVideoElement | null>(null);
    const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

    const [localVideoTrackState, setLocalVideoTrack] = useRecoilState(localVideoTrack);
    const [localAudioTrackState, setLocalAudioTrack] = useRecoilState(localAudioTrack);

    const addAndListenForTracks = useCallback(() => {
        if(!meet) return;
        meet.localConnection.ontrack = (event: any) => {
            console.log("track received out");
            if (remoteVideoRef.current && event.track) {
                console.log("track received");

                const remoteStream = new MediaStream();

                remoteStream.addTrack(event.track);

                // Set the srcObject of the video element
                remoteVideoRef.current.srcObject = remoteStream;
            } else {
                console.warn("remote ref null");
            }
        };
    }, [meet]);

    const sendStreamToRemote = useCallback(() => {
        if (localVideoTrackState) {
            // Check if a sender for the track already exists
            const sender = meet?.localConnection.getSenders().find(s => s.track === localVideoTrackState);

            console.log(sender);
            if (sender) {
                // If a sender exists, replace the track
                void sender.replaceTrack(localVideoTrackState);
                console.log("Track has been replaced");
            } else {
                if(localVideoRef.current && meet) {
                    // If no sender exists, add the track
                    meet.localConnection.addTrack(localVideoTrackState);
                    console.log("first time kata tracks");
                }
            }
        }
    }, [localVideoTrackState]);

    const init = useCallback(() => {
        const localVideoTrackFromMap = getLocalVideoStreamTrack();

        if (localVideoTrackFromMap) {
            const newVideoStream = new MediaStream([localVideoTrackFromMap]);
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = newVideoStream;
            }
        }

        let mediaConstraints: MediaStreamConstraints = {};

        if (userPreferences.cameraStatus) {
            mediaConstraints.video = videoConstraints;
        }

        if (userPreferences.micStatus) {
            mediaConstraints.audio = audioConstraints;
        }

        if (Object.keys(mediaConstraints).length <= 0) {
            return;
        }

        window.navigator.mediaDevices
            .getUserMedia(mediaConstraints)
            .then((localStream) => {
                const videoStreamTracks = localStream.getVideoTracks();

                if (videoStreamTracks.length >= 1) {
                    const videoTrack = localStream.getVideoTracks()[0];

                    const videoStream = new MediaStream([videoTrack]);
                    if (localVideoRef.current) {
                        const prevStream = localVideoRef.current
                            .srcObject as MediaStream;
                        releaseMediaStream(prevStream);

                        localVideoRef.current.srcObject = videoStream;
                    }

                    setLocalVideoTrack(videoTrack);
                    videoStreamTrackMap.set(videoTrack.id, videoTrack);
                }

                const audiStreamTracks = localStream.getAudioTracks();
                if (audiStreamTracks.length >= 1) {
                    const audioTrack = localStream.getAudioTracks()[0];

                    setLocalAudioTrack(audioTrack);
                    audioStreamTrackMap.set(audioTrack.id, audioTrack);
                }
            })
            .catch((err) => {
                console.error("Error occurred when initializing media: ", err);
            });
    }, [meetCode]);

    useEffect(() => {
        init();

    }, [init]);

    useEffect(() => {
        addAndListenForTracks();
    }, [addAndListenForTracks]);

    useEffect(() => {
        const meetId = window.sessionStorage.getItem("meetId");
        const sessionId = window.sessionStorage.getItem("sessionId");

        if (meet === null) {
            return;
        }

        if (!meetId || !sessionId) {
            console.log("No meetId or sessionId available in sessionStorage");
        }

        if(meet.signalingServer.readyState !== WebSocket.OPEN) {
            meet.signalingServer.addEventListener("open", () => {
                meet.joinMeet();
            });
        } else {
            meet.joinMeet();
        }
    }, [meet]);

    useEffect(() => {
        sendStreamToRemote()
    }, [sendStreamToRemote]);

    const toggleCameraButton = (updatedCameraStatus: boolean) => {
        if (updatedCameraStatus && !localVideoTrackState) {
            window.navigator.mediaDevices
                .getUserMedia({
                    video: videoConstraints,
                })
                .then((localVideoStream) => {
                    const videoTrack = localVideoStream.getVideoTracks()[0];

                    setLocalVideoTrack(videoTrack);
                    videoStreamTrackMap.set(videoTrack.id, videoTrack);

                    if (localVideoRef.current) {
                        const prevVideoStream = localVideoRef.current
                            .srcObject as MediaStream;
                        releaseMediaStream(prevVideoStream);

                        localVideoRef.current.srcObject = localVideoStream;
                        // sendStreamToRemote();
                    }

                    updateUserPreferences({cameraStatus: true});
                });
        } else {
            setLocalVideoTrack(null);
            turnOffCamera();

            updateUserPreferences({cameraStatus: false});
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
                    audioStreamTrackMap.set(audioTrack.id, audioTrack);

                    updateUserPreferences({micStatus: true});
                })
                .catch((err) => {
                    console.error(
                        "Error while initializing audio stream: ",
                        err
                    );
                });
        } else {
            setLocalAudioTrack(null);
            turnOffMic();

            updateUserPreferences({micStatus: false});
        }
    };

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

                            <video
                                ref={remoteVideoRef}
                                className='absolute top-0 left-0 w-full h-full rounded-xl'
                                autoPlay
                            ></video>
                        </div>
                    </div>
                </div>

                <div className='bg-slate-800 h-[80px]'>
                    <div className='flex gap-4 justify-center items-center h-full text-white'>
                        <MicButton
                            onClickFn={toggleMicButton}
                            action={userPreferences.micStatus ? "open" : "close"}
                        />
                        <CameraButton
                            onClickFn={toggleCameraButton}
                            action={userPreferences.cameraStatus ? "open" : "close"}
                        />

                        {/* end call button */}
                        <div
                            className='absolute z-10 invisible inline-block px-3 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg shadow-sm opacity-0 tooltip dark:bg-gray-700'></div>
                        <div
                            className='rounded-full w-[46px] h-[46px] bg-red-600 flex justify-center items-center hover:cursor-pointer hover:bg-red-700 transition duration-300'>
                            <PhoneXMarkIcon className='w-[23px] h-[23px]'/>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
