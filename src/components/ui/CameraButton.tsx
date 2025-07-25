import {VideoCameraIcon, VideoCameraSlashIcon} from "@heroicons/react/24/outline";

interface ICameraButtonPros {
    onClickFn: (cameraStatus: boolean) => void;
    action: "open" | "close";
}

export function CameraButton({onClickFn, action}: ICameraButtonPros) {
    return (
        action === "open" ? (
            <div
                onClick={() => onClickFn(false)}
                className='rounded-full w-[46px] h-[46px] border border-white flex justify-center items-center hover:cursor-pointer hover:bg-slate-400 transition duration-300'
            >
                <VideoCameraIcon className='w-[23px] h-[23px]'/>
            </div>
        ) : (
            <div
                onClick={() => onClickFn(true)}
                className='rounded-full w-[46px] h-[46px] bg-red-600 flex justify-center items-center hover:cursor-pointer hover:bg-red-700 transition duration-300'
            >
                <VideoCameraSlashIcon className='w-[23px] h-[23px]'/>
            </div>
        )
    )
}