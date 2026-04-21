"use client";

import { PhoneOff } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {MicButton} from "@/src/components/ui/MicButton";
import {CameraButton} from "@/src/components/ui/CameraButton";
import {VideoTile} from "@/src/components/ui/VideoTile";
import { useMeetStore } from "@/src/stores/meet";
import { usePeerStore } from "@/src/stores/peer";
import { useJoinMeetStore } from "@/src/stores/joinMeet";
import type { SignalingClient } from "@/src/services/signaling/client";

interface MeetCallProps {
    client: SignalingClient | null;
}

export default function MeetCall({ client }: MeetCallProps) {
    const {
        isMuted,
        isVideoOff,
        toggleMute,
        toggleVideo
    } = useMeetStore();

    const {
        localStream,
        initializeCamera,
        peerConnections,
    } = usePeerStore();

    const remoteCount = peerConnections.size;

    const { userName, clearJoinMeet } = useJoinMeetStore();
    const router = useRouter();

    const broadcastState = (audio: boolean, video: boolean) => {
        client?.send('peer-state', { audio, video });
    };

    const handleMicToggle = () => {
        const nextMuted = !isMuted;
        localStream?.getAudioTracks().forEach((t) => { t.enabled = !nextMuted });
        toggleMute();
        broadcastState(!nextMuted, !isVideoOff);
    };

    const handleCameraToggle = async () => {
        const nextVideoOff = !isVideoOff;
        let stream = localStream;
        if (!stream) {
            stream = await initializeCamera();
            if (!stream) {
                toast.error("Camera unavailable. Check browser permissions and try again.");
                return;
            }
        }
        stream.getVideoTracks().forEach((t) => { t.enabled = !nextVideoOff });
        toggleVideo();
        broadcastState(!isMuted, !nextVideoOff);
    };

    const handleEndCall = () => {
        clearJoinMeet();
        router.push('/');
    };


    return (
        <div className='bg-slate-900 min-h-screen'>
            <main className='flex flex-col h-screen'>
                <div className='flex-1 p-4 pb-20 overflow-auto min-h-0'>
                    <div className='h-full flex items-center justify-center'>
                        {/* Dynamic grid based on participant count */}
                        <div className={`grid gap-4 w-full h-full ${
                            remoteCount + 1 === 1 ? 'grid-cols-1 max-w-4xl mx-auto' :
                            remoteCount + 1 === 2 ? 'grid-cols-1 md:grid-cols-2 max-w-6xl mx-auto' :
                            remoteCount + 1 <= 4 ? 'grid-cols-1 md:grid-cols-2 max-w-6xl mx-auto' :
                            remoteCount + 1 <= 6 ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 max-w-7xl mx-auto' :
                            'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                        }`}>
                            {/* Local video (you) */}
                            <VideoTile
                                isLocal={true}
                                userName={userName}
                                isVideoOff={isVideoOff}
                                isMuted={isMuted}
                                stream={localStream}
                            />

                            {/* Remote participants */}
                            {Array.from(peerConnections.values()).map((c) => (
                                <VideoTile
                                    key={c.id}
                                    participant={{
                                        id: c.id,
                                        name: c.name || c.id.slice(0, 6),
                                        isMuted: !c.audio,
                                        isVideoOff: !c.video,
                                    }}
                                    stream={c.stream ?? null}
                                />
                            ))}
                        </div>
                    </div>
                </div>

                {/* Bottom controls */}
                <div className='fixed bottom-0 left-0 right-0 bg-slate-800 border-t border-slate-700'>
                    <div className='flex gap-6 justify-center items-center py-4 px-4'>
                        <MicButton
                            onClickFn={handleMicToggle}
                            action={isMuted ? "close" : "open"}
                        />
                        <CameraButton
                            onClickFn={handleCameraToggle}
                            action={isVideoOff ? "close" : "open"}
                        />

                        {/* End call button */}
                        <button
                            onClick={handleEndCall}
                            className='rounded-full w-12 h-12 bg-red-600 flex justify-center items-center hover:bg-red-700 transition duration-300 focus:outline-none'
                        >
                            <PhoneOff className='w-6 h-6 text-white'/>
                        </button>
                    </div>
                </div>
            </main>
        </div>
    );
}
