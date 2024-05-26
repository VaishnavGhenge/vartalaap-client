import Link from "next/link";

export default function register() {
    return (
        <div className="flex items-center justify-center min-h-screen">
            <div className="mt-[-100px]">
                <h3 className="text-xl mb-6 text-center">Register on Vartalaap</h3>

                <div className="flex gap-4 mb-4">
                    <div className="flex flex-col">
                        <label htmlFor="firstName" className="input-label">First name<span
                            className="text-red-500">*</span></label>
                        <input type="text" id="firstName" name="firstName" className="input"/>
                    </div>

                    <div className="flex flex-col">
                        <label htmlFor="lastName" className="input-label">Last name<span
                            className="text-red-500">*</span></label>
                        <input type="text" id="lastName" name="lastName" className="input"/>
                    </div>
                </div>

                <div className="flex flex-col mb-4">
                    <label htmlFor="email" className="input-label">Email<span className="text-red-500">*</span></label>
                    <input type="email" id="email" name="email" className="input" placeholder="user@email.com"/>
                </div>

                <div className="flex flex-col mb-4">
                    <label htmlFor="password" className="input-label">Password<span
                        className="text-red-500">*</span></label>
                    <input type="password" id="password" className="input"/>
                </div>

                <div className="flex flex-col mb-6">
                    <label htmlFor="password2" className="input-label">Password again<span
                        className="text-red-500">*</span></label>
                    <input type="password" id="password2" name="password2" className="input"/>
                </div>

                <div className="flex flex-col mb-6">
                    <button className="btn-vartalaap w-full">Register</button>
                </div>

                <div className="text-center">
                    <p className="text-xs">Already have an account? <Link href="/login" className="link">Login</Link>
                    </p>
                </div>
            </div>
        </div>
    )
}