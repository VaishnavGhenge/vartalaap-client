"use client";

import { PhoneOff } from "lucide-react";
import {MicButton} from "@/src/components/ui/MicButton";
import {CameraButton} from "@/src/components/ui/CameraButton";
import {VideoTile} from "@/src/components/ui/VideoTile";
import { useMeetStore } from "@/src/stores/meet";
import { usePeerStore } from "@/src/stores/peer";
import { useJoinMeetStore } from "@/src/stores/joinMeet";

export default function MeetCall() {
    const {
        participants,
        isMuted,
        isVideoOff,
        toggleMute,
        toggleVideo
    } = useMeetStore();
    
    const {
        localStream,
        initializeCamera,
        stopCamera,
    } = usePeerStore();
    
    const { userName } = useJoinMeetStore();

    const handleCameraToggle = async () => {
        if (isVideoOff) {
            await initializeCamera();
        } else {
            stopCamera();
        }
        toggleVideo();
    };
    
    const handleEndCall = () => {
        // TODO: Implement end call logic
        console.log('End call');
    };
    

    return (
        <div className='bg-slate-900 min-h-screen'>
            <main className='flex flex-col h-screen'>
                <div className='flex-1 p-4 pb-20 overflow-auto min-h-0'>
                    <div className='h-full flex items-center justify-center'>
                        {/* Dynamic grid based on participant count */}
                        <div className={`grid gap-4 w-full h-full ${
                            participants.length + 1 === 1 ? 'grid-cols-1 max-w-4xl mx-auto' :
                            participants.length + 1 === 2 ? 'grid-cols-1 md:grid-cols-2 max-w-6xl mx-auto' :
                            participants.length + 1 <= 4 ? 'grid-cols-1 md:grid-cols-2 max-w-6xl mx-auto' :
                            participants.length + 1 <= 6 ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 max-w-7xl mx-auto' :
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
                            {participants.map((participant) => (
                                <VideoTile 
                                    key={participant.id} 
                                    participant={participant}
                                    stream={null}
                                />
                            ))}
                        </div>
                    </div>
                </div>

                {/* Bottom controls */}
                <div className='fixed bottom-0 left-0 right-0 bg-slate-800 border-t border-slate-700'>
                    <div className='flex gap-6 justify-center items-center py-4 px-4'>
                        <MicButton
                            onClickFn={toggleMute}
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