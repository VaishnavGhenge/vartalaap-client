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
import {MicButton} from "@/components/vartalaap-elements/MicButton";
import {CameraButton} from "@/components/vartalaap-elements/CameraButton";

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

    const addAndListenForTracks = useCallback(() => {
        if (localVideoTrackState) {
            // Check if a sender for the track already exists
            const sender = meet?.localConnection.getSenders().find(s => s.track === localVideoTrackState);

            if (sender) {
                // If a sender exists, replace the track
                console.log("track replaced", localVideoTrackState.id, localVideoTrackState.muted);
                sender.replaceTrack(localVideoTrackState);
            } else {
                if(localVideoRef.current && meet) {
                    // If no sender exists, add the track
                    console.log("track added", localVideoTrackState.id, localVideoTrackState.muted);
                    meet.localConnection.addTrack(localVideoTrackState, localVideoRef.current.srcObject as MediaStream);
                }
            }
        }

        console.log(meet);
        if(!meet) return;
        meet.localConnection.ontrack = (event: any) => {
            console.log("track received");
            if (remoteVideoRef.current) {
                // Create a new MediaStream and append the received track

                    console.log("track received");
                    console.log(event.track);

                    const remoteStream = new MediaStream();

                    remoteStream.addTrack(event.track);

                    // Set the srcObject of the video element
                    remoteVideoRef.current.srcObject = remoteStream;

                    console.log(remoteVideoRef.current?.srcObject);

            } else {
                console.warn("remote ref null");
            }
        };
    }, [localVideoTrackState]);

    useEffect(() => {
        init();

    }, [init]);

    useEffect(() => {
        const meetId = window.sessionStorage.getItem("meetId");
        const sessionId = window.sessionStorage.getItem("sessionId");

        if (!meetId || !sessionId) {
            console.log("No meetId or sessionId available in sessionStorage");
            return;
        }

        if (meet === null) {
            return;
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
        addAndListenForTracks();
    }, [addAndListenForTracks]);

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
                                hidden={!userPreferences.cameraStatus}
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
