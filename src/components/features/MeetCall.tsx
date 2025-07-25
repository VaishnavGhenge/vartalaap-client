"use client";

import {
    PhoneXMarkIcon,
} from "@heroicons/react/24/outline";
import {IUserPreferences} from "@/src/utils/types";
import {Meet} from "@/src/services/webrtc/webrtc";
import {MicButton} from "@/src/components/ui/MicButton";
import {CameraButton} from "@/src/components/ui/CameraButton";

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
                                className='absolute top-0 left-0 w-full h-full rounded-xl'
                                autoPlay
                            ></video>
                        </div>
                    </div>
                </div>

                <div className='bg-slate-800 h-[80px]'>
                    <div className='flex gap-4 justify-center items-center h-full text-white'>
                        <MicButton
                            onClickFn={() => {}}
                            action={userPreferences.micStatus ? "open" : "close"}
                        />
                        <CameraButton
                            onClickFn={() => {}}
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
