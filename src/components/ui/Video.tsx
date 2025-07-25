import {useEffect, useRef} from "react";


interface VideoProps {
    stream : MediaStream | null;
    isLocal : boolean;
}


export const VideoStream = ({stream, isLocal}: VideoProps) => {
    const ref = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        if (ref.current) {
            ref.current.srcObject = stream;
        }
    }, [stream]);

    return <video
        ref={ref}
        className='absolute inset-0 w-full h-full object-cover'
        autoPlay
        muted={isLocal}
        playsInline
    />
}