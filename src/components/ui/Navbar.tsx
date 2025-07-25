import AppTitle from "./AppTitle";
import { Button } from "@/src/components/ui/button";
import {useRouter} from "next/navigation";

const Navbar = () => {
    const router = useRouter();

    return (
        <nav className='bg-white w-screen'>
            <div className='flex justify-between items-center px-6 py-4'>
                <div>
                    <AppTitle/>
                </div>

                <div className="flex gap-2">
                    <Button variant="primary" onClick={() => router.push("/login")}>Login</Button>
                    <Button variant="outline" onClick={() => router.push("/register")}>Signup</Button>
                </div>
            </div>
        </nav>
    );
};

export default Navbar;
