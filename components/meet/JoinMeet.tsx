"use client";

import Navbar from "@/components/vartalaap-elements/Navbar";
import {useRef, useEffect, useCallback, useReducer, SetStateAction, Dispatch, useState} from "react";
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
import {audioConstraints, httpServerUri, videoConstraints} from "@/utils/config";
import {MicButton} from "@/components/vartalaap-elements/MicButton";
import {CameraButton} from "@/components/vartalaap-elements/CameraButton";
import {Meet} from "@/webrtc/webrtc";
import {MeetEvent} from "@/webrtc/config";
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from "@/components/ui/tooltip";

export default function JoinMeet(
    {
        meetCode,
        userPreferences,
        updateUserPreferences,
        meet,
        setMeet,
    }: {
        meetCode: string;
        userPreferences: IUserPreferences;
        updateUserPreferences: Function;
        meet: Meet | null,
        setMeet: Dispatch<SetStateAction<Meet | null>>,
    }) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [localAudioTrackState, setLocalAudioTrack] = useRecoilState(localAudioTrack);
    const [localVideoTrackState, setLocalVideoTrack] = useRecoilState(localVideoTrack);

    const [videoDimensions, dispatchVideoDimensions] = useReducer(videoDimensionReducer, {width: 740, height: 416});
    const [, setIsMeetJoined] = useRecoilState(isMeetJoined);
    const [joinedPeersState, setJoinedPeers] = useRecoilState(joinedPeers);
    const [isCopy, setIsCopy] = useState(true);

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

        if (!meetId || !sessionId) {
            console.log("No meetId or sessionId available in sessionStorage");

            fetch(`${httpServerUri}/join-meet?meetId=${meetId}`, {
                method: "GET",
                headers: {
                    'Content-Type': 'application/json',
                },
            })
                .then((response) => response.json())
                .then((data) => {
                    window.sessionStorage.setItem("sessionId", data.sessionId);
                    window.sessionStorage.setItem("meetId", data.meetId);

                    const meet = Meet.getInstance(data.meetId, data.sessionId);
                    setMeet(meet);

                    meet.signalingServer.addEventListener("open", () => {
                        meet.joinMeetLobby();
                    });
                });

            return;
        }

        if (meet === null) {
            return;
        }

        meet.signalingServer.addEventListener("open", () => {
            meet.joinMeetLobby();
        });

        const peerJoinedListener = meet.on(MeetEvent.PEER_JOINED, (data: ISignalingMessage) => {
            setJoinedPeers(data.sessionIdList);
        });

        return () => {
            if (peerJoinedListener) {
                meet.off(MeetEvent.PEER_JOINED, peerJoinedListener);
            }
        }

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

    const onClickCopyMeetCode = () => {
        if(!isCopy) {
            return;
        }

        navigator.clipboard.writeText(meetCode)
            .then(() => {
                setIsCopy(false);

                setTimeout(() => {
                    setIsCopy(true);
                }, 1500);
            });
    }

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

                                <div
                                    className="flex items-center justify-center bg-slate-200 text-slate-900 px-2 py-2 mb-4 rounded">
                                    <p className="text-sm mr-2">{meetCode}</p>
                                    <div className="flex items-center justify-center text-sky-700" onClick={onClickCopyMeetCode}>
                                        <TooltipProvider>
                                            <Tooltip>
                                                <TooltipTrigger>
                                                    {isCopy ?
                                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none"
                                                             viewBox="0 0 24 24"
                                                             strokeWidth={1.3} stroke="currentColor"
                                                             className="w-5 h-5">
                                                            <path strokeLinecap="round" strokeLinejoin="round"
                                                                  d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75"/>
                                                        </svg> :
                                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none"
                                                             viewBox="0 0 24 24" strokeWidth={1.3} stroke="currentColor"
                                                             className="w-5 h-5">
                                                            <path strokeLinecap="round" strokeLinejoin="round"
                                                                  d="m4.5 12.75 6 6 9-13.5"/>
                                                        </svg>
                                                    }
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <p>{isCopy ? "Copy to clipboard" : "Copied!"}</p>
                                                </TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>
                                    </div>
                                </div>

                                <button
                                    className='text-base bg-sky-700 rounded-full text-white px-6 py-3 hover:cursor-pointer hover:bg-sky-800 transition duration-300'
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
