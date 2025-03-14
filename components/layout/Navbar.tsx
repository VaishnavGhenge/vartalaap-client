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

    return (
        <nav className='bg-white w-screen'>
            <div className='flex justify-between items-center px-6 py-4'>
                <div>
                    <AppTitle/>
                </div>

                <div className="flex gap-2">
                    <button className="btn-vartalaap" type="button">Login</button>
                    <button className="btn-faint-vartalaap" type="button">Signup</button>
                </div>
            </div>
        </nav>
    );
};

export default Navbar;
