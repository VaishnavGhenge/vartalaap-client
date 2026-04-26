import AppTitle from "./AppTitle";
import { ThemeToggle } from "@/src/components/ui/ThemeToggle";

const Navbar = () => {
    return (
        <nav className="sticky top-0 z-40 w-full border-b border-[hsl(var(--border))]/60 bg-[hsl(var(--background))]/80 backdrop-blur-xl">
            <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
                <AppTitle />
                <ThemeToggle />
            </div>
        </nav>
    );
};

export default Navbar;
