import Link from "next/link";

export default function login() {
    return (
        <div className="flex justify-center items-center  min-h-screen">
            <div className="mt-[-100px]">
                <h3 className="text-xl mb-6 text-center">Login into Vartalaap</h3>

                <div className="mb-6 w-[300px]">
                    <div className="flex flex-col mb-2">
                        <label htmlFor="email" className="input-label">Email</label>
                        <input id="email" type="email" className="input" placeholder="user@email.com"/>
                    </div>

                    <div className="flex flex-col relative mb-2">
                        <label htmlFor="password" className="input-label">Password</label>
                        <input id="password" type="password" className="input" />
                    </div>
                </div>

                <div className="w-[300px] mb-6">
                    <button type="button" className="btn-vartalaap w-full">Login</button>
                </div>

                <div className="text-center">
                    <p className="text-xs">
                        <span>Don&apos;t have an account? </span>
                        <Link href="/register" className="link" prefetch={true}>Register</Link>
                    </p>
                </div>
            </div>
        </div>
    )
}