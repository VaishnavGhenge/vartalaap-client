import { Mic, MicOff } from "lucide-react";

interface IMicButtonProps {
    onClickFn: (micStatus: boolean) => void;
    action: "close" | "open";
}

export function MicButton({onClickFn, action}: IMicButtonProps) {
    return (
        action === "open" ? (
            <div
                onClick={() => onClickFn(false)}
                className='rounded-full w-[46px] h-[46px] border border-white flex justify-center items-center hover:cursor-pointer hover:bg-slate-400 transition duration-300'
            >
                <Mic className='w-[23px] h-[23px] text-white'/>
            </div>
        ) : (
            <div
                onClick={() => onClickFn(true)}
                className='rounded-full w-[46px] h-[46px] bg-red-600 flex justify-center items-center hover:cursor-pointer hover:bg-red-700 transition duration-300'
            >
                <MicOff className='w-[23px] h-[23px] text-white'/>
            </div>
        )
    )
}