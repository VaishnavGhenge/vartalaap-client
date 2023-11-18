import AppTitle from "../AppTitle";
import Image from "next/image";

const Navbar = () => {
    return (
        <nav className='width-full'>
            <ul className='flex justify-between items-center px-6 py-4'>
                <li>
                    <AppTitle />
                </li>
                <li>
                    <div>
                        <a href='#account'>
                            <Image
                                className='w-[50px] h-[50px] rounded-full'
                                src='/static/images/test-account.png'
                                alt='profile'
                                width={50}
                                height={50}
                            />
                        </a>
                    </div>
                </li>
            </ul>
        </nav>
    );
};

export default Navbar;
