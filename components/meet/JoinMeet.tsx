"use client";

import Navbar from "@/components/vartalaap-elements/Navbar";
import {useRef, useEffect, useCallback, useReducer} from "react";
import {useRecoilState} from "recoil";
import {
    releaseMediaStream,
    audioStreamTrackMap,
    turnOffMic,
    videoStreamTrackMap,
    turnOffCamera,
    videoDimensionReducer,
} from "@/webrtc/utils";
import {localAudioTrack, localVideoTrack} from "@/webrtc/recoilStates";
import {isMeetJoined, joinedPeers} from "@/recoil/global";
import {ISignalingMessage, IUserPreferences} from "@/utils/types";
import {audioConstraints, videoConstraints} from "@/utils/config";
import {MicButton} from "@/components/vartalaap-elements/MicButton";
import {CameraButton} from "@/components/vartalaap-elements/CameraButton";
import {Meet} from "@/webrtc/webrtc";
import {MeetEvent} from "@/webrtc/config";

export default function JoinMeet(
    {
        meetCode,
        userPreferences,
        updateUserPreferences,
        meet,
    }: {
        meetCode: string;
        userPreferences: IUserPreferences;
        updateUserPreferences: Function;
        meet: Meet | null
    }) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [localAudioTrackState, setLocalAudioTrack] = useRecoilState(localAudioTrack);
    const [localVideoTrackState, setLocalVideoTrack] = useRecoilState(localVideoTrack);

    const [videoDimensions, dispatchVideoDimensions] = useReducer(videoDimensionReducer, {width: 740, height: 416});
    const [, setIsMeetJoined] = useRecoilState(isMeetJoined);
    const [joinedPeersState, setJoinedPeers] = useRecoilState(joinedPeers);

    const init = useCallback(() => {
        let mediaConstraints: MediaStreamConstraints = {};

        if (!localVideoTrackState) {
            mediaConstraints.video = videoConstraints;
        }

        if (!localAudioTrackState) {
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
                    if (videoRef.current) {
                        const prevStream = videoRef.current.srcObject as MediaStream;
                        releaseMediaStream(prevStream);
                        videoRef.current.srcObject = videoStream;
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

    const joinMeetLobby = useCallback(() => {
        const meetId = window.sessionStorage.getItem("meetId");
        const sessionId = window.sessionStorage.getItem("sessionId");
        let peerJoinedListener: ((this: WebSocket, ev: MessageEvent<any>) => any) | null = null;

        if (!meetId || !sessionId) {
            console.log("No meetId or sessionId available in sessionStorage");
            return;
        }

        if (meet === null) {
            return;
        }

        console.log("here join meet");
        meet.signalingServer.addEventListener("open", () => {
            console.log("join lobby called on open")
            meet.joinMeetLobby();

            peerJoinedListener = meet.on(MeetEvent.PEER_JOINED, (data: ISignalingMessage) => {
                setJoinedPeers(data.sessionIdList);
            });
        });
    }, [meet]);

    // Initialize video and audio streams
    useEffect(() => {
        init();

    }, [init]);

    useEffect(() => {
        joinMeetLobby();

    }, [joinMeetLobby]);

    // Resize video tag on screen size changes
    useEffect(() => {
        const handleResize = () => {
            const screenWidth = window.innerWidth;

            dispatchVideoDimensions({type: "width", value: screenWidth / 2});
        }

        window.addEventListener("resize", handleResize);

        handleResize();

        return () => {
            window.removeEventListener("resize", handleResize)
        }
    }, []);

    const toggleCameraButton = (updatedCameraStatus: boolean) => {
        if (updatedCameraStatus && !localVideoTrackState) {
            videoStreamTrackMap.forEach((track) => console.log(track));
            window.navigator.mediaDevices
                .getUserMedia({
                    video: videoConstraints,
                })
                .then((localVideoStream) => {
                    const videoTrack = localVideoStream.getVideoTracks()[0];

                    if (videoRef.current) {
                        const prevStream = videoRef.current.srcObject as MediaStream;
                        releaseMediaStream(prevStream);

                        videoRef.current.srcObject = localVideoStream;
                    }

                    setLocalVideoTrack(videoTrack);
                    videoStreamTrackMap.set(videoTrack.id, videoTrack);

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
                    releaseMediaStream(localAudioStream);
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

    const onJoinButtonClick = () => {
        if (videoRef.current) {
            const stream = videoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach((track) => {
                if (track.id !== localVideoTrackState?.id) {
                    track.stop();
                }
            });

            setIsMeetJoined(true);
        }
    };

    return (
        <div>
            <Navbar/>
            <main className='mt-[82px]'>
                <div className='container mx-auto h-full'>
                    <div className='grid grid-cols-2 md:grid-cols-3 gap-4 h-full'>
                        <div className='col-span-2 flex flex-col items-center justify-center text-white h-full'>
                            <div
                                className='relative bg-gray-900 rounded-xl p-6'
                                style={{width: videoDimensions.width, height: videoDimensions.height}}
                            >
                                <span className='absolute top-6 left-6 z-10'>
                                    Vaishnav Ghenge
                                </span>

                                <span
                                    hidden={userPreferences.cameraStatus}
                                    className='text-2xl absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2'
                                >
                                    Camera is off
                                </span>

                                <div
                                    className='absolute bottom-6 left-1/2 transform -translate-x-1/2 flex gap-4 justify-center items-center z-10'
                                >
                                    <MicButton
                                        onClickFn={toggleMicButton}
                                        action={userPreferences.micStatus ? "open" : "close"}
                                    />
                                    <CameraButton
                                        onClickFn={toggleCameraButton}
                                        action={userPreferences.cameraStatus ? "open" : "close"}
                                    />
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
                                        {joinedPeersState.length === 0 ? "No one else is here" : String(joinedPeersState)}
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
