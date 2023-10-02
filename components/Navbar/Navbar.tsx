import AppTitle from '../AppTitle';

const Navbar = () => {
    return (
        <nav className='width-full'>
            <ul className='flex justify-between items-center px-6 py-4'>
                <li>
                    <AppTitle />
                </li>
                <li>
                    <div>
                        <a href="#account">
                            <img className='' src="/static/images/test-account.png" alt="profile" />
                        </a>
                    </div>
                </li>
            </ul>
        </nav>
    )
}

export default Navbar;