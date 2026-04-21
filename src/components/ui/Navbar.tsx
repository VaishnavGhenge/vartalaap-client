import AppTitle from "./AppTitle";

const Navbar = () => {
    return (
        <nav className='bg-white w-screen'>
            <div className='flex justify-between items-center px-6 py-4'>
                <div>
                    <AppTitle/>
                </div>
            </div>
        </nav>
    );
};

export default Navbar;
