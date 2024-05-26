import AppTitle from "./AppTitle";
import {ProfilePicture} from "@/components/layout/ProfilePicture";
import {useRecoilValue} from "recoil";
import {user} from "@/recoil/auth";
import Image from "next/image";
import React, {useMemo} from "react";
import {
    DropdownMenu,
    DropdownMenuContent, DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import Link from "next/link";

const Navbar = () => {
    const loggedInUser = useRecoilValue(user);

    const userAvatar = useMemo(() => {
        if (!loggedInUser) return <div className="border rounded-full hover:cursor-pointer">
            <Image
                src="/static/icons/icons8-avatar-60.png"
                width={40}
                height={40}
                alt="Profile avatar"
            />
        </div>;

        return <div className="w-[40px] h-[40px] object-fill hover:cursor-pointer">
            <ProfilePicture className="overflow-hidden" name={loggedInUser!.firstName + " " + loggedInUser!.lastName}/>
        </div>
    }, [loggedInUser]);

    const dropDownOptions = useMemo(() => {
        if(!loggedInUser) return <DropdownMenuContent align="end">
            <DropdownMenuItem><Link href="/login" prefetch={true}>Login</Link></DropdownMenuItem>
            <DropdownMenuItem><Link href="/register" prefetch={true}>Register</Link></DropdownMenuItem>
        </DropdownMenuContent>;

        return <DropdownMenuContent align="end">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator/>
            <DropdownMenuItem>Logout</DropdownMenuItem>
        </DropdownMenuContent>
    }, [loggedInUser]);

    return (
        <nav className='width-full bg-white'>
            <div className='flex justify-between items-center px-6 py-4'>
                <div>
                    <AppTitle/>
                </div>

                <div>
                    <DropdownMenu>
                        <DropdownMenuTrigger>{userAvatar}</DropdownMenuTrigger>
                        {dropDownOptions}
                    </DropdownMenu>

                </div>
            </div>
        </nav>
    );
};

export default Navbar;
