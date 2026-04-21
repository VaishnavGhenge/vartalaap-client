import AppTitle from "./AppTitle";
import { ThemeToggle } from "@/src/components/ui/ThemeToggle";

const Navbar = () => {
    return (
        <nav className='sticky top-0 z-40 w-full border-b border-[hsl(var(--border))]/80 bg-[hsl(var(--background))]/75 backdrop-blur-xl'>
            <div className='mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8'>
                <AppTitle/>
                <ThemeToggle />
            </div>
        </nav>
    );
};

export default Navbar;
