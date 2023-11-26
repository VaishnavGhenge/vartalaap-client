'use client';

import { UserPreferences, getUserMeetPreferences, setUserMeetPreferences } from "@/utils/userPreferences";
import { useEffect, useState } from "react";
import Image from "next/image";
import { MicrophoneIcon, VideoCameraIcon, VideoCameraSlashIcon, PhoneXMarkIcon } from "@heroicons/react/24/outline";

export default function Meet() {
    const [userPreferences, setUserPreferences] = useState<UserPreferences>({micStatus: false, cameraStatus: false});

    useEffect(() => {
        const _userPreferences = getUserMeetPreferences();
        console.log("user preferences restored: ", _userPreferences);
        setUserPreferences(_userPreferences);
    }, []);

    const updateUserPreferences = (preferences: {
        micStatus?: boolean;
        cameraStatus?: boolean;
    }) => {
        const updatedPreferences = {
            ...userPreferences,
            ...preferences,
        } as UserPreferences;

        console.log("newely formed preferences: ", updatedPreferences);

        setUserMeetPreferences(updatedPreferences);
        setUserPreferences(updatedPreferences);
    };

    const toggleMicButton = () => {
        updateUserPreferences({micStatus: !userPreferences.micStatus});
    }

    const toggleCameraButton = () => {
        updateUserPreferences({cameraStatus: !userPreferences.cameraStatus});
    }

    const cameraButton = userPreferences.cameraStatus ? (
        <div
            onClick={toggleCameraButton}
            className='rounded-full w-[56px] h-[56px] border border-white flex justify-center items-center hover:cursor-pointer hover:bg-slate-400 transition duration-300'
        >
            <VideoCameraIcon className='w-[24px] h-[24px]' />
        </div>
    ) : (
        <div
            onClick={toggleCameraButton}
            className='rounded-full w-[56px] h-[56px] bg-red-600 flex justify-center items-center hover:cursor-pointer hover:bg-red-700 transition duration-300'
        >
            <VideoCameraSlashIcon className='w-[24px] h-[24px]' />
        </div>
    );

    const micButton = userPreferences.micStatus ? (
        <div
            onClick={toggleMicButton}
            className='rounded-full w-[56px] h-[56px] border border-white flex justify-center items-center hover:cursor-pointer hover:bg-slate-400 transition duration-300'
        >
            <MicrophoneIcon className='w-[24px] h-[24px]' />
        </div>
    ) : (
        <div
            onClick={toggleMicButton}
            className='rounded-full w-[56px] h-[56px] bg-red-600 flex justify-center items-center hover:cursor-pointer hover:bg-red-700 transition duration-300'
        >
            <Image
                src='/static/icons/microphone-off.svg'
                width={24}
                height={24}
                alt='Micorphone icon'
            />
        </div>
    );

    return (
        <div className='bg-slate-900'>            
            <main>
                <div className='h-screen mb-[-80px]'></div>
                <div className='bg-slate-800 h-[80px]'>
                    <div className='flex gap-4 justify-center items-center h-full text-white'>
                        {micButton}
                        {cameraButton}

                        {/* end call button */}
                        <div className='absolute z-10 invisible inline-block px-3 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg shadow-sm opacity-0 tooltip dark:bg-gray-700'></div>
                        <div className='rounded-full w-[56px] h-[56px] bg-red-600 flex justify-center items-center hover:cursor-pointer hover:bg-red-700 transition duration-300'>
                            <PhoneXMarkIcon className='w-[24px] h-[24px]' />
                        </div>
                    </div>
                </div>
            </main>
        </div>
    )
}