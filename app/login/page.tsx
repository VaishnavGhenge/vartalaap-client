"use client";

import Navbar from "@/src/components/ui/Navbar";
import Link from "next/link";
import { BufferingButtonLabel } from "@/src/components/ui/BufferingButtonLabel";
import { Input } from "@/src/components/ui/input";

export default function Login() {
    return (
        <div className='min-h-screen'>
            <Navbar />
            <div className='flex justify-center items-center'>
                <div>
                    <h3 className='text-xl mb-6 text-center'>
                        Log into Vartalaap
                    </h3>

                    <form>

                        <div className='mb-6 w-[300px]'>
                            <div className='flex flex-col mb-2'>
                                <label htmlFor='email' className='input-label'>
                                    Email
                                </label>
                                <Input
                                    type='email'
                                    id='email'
                                    name="email"
                                    placeholder='user@email.com'
                                />
                            </div>

                            <div className='flex flex-col relative mb-2'>
                                <label
                                    htmlFor='password'
                                    className='input-label'
                                >
                                    Password
                                </label>
                                <Input
                                    type='password'
                                    id='password'
                                    name="password"
                                />
                            </div>
                        </div>

                        <div className='w-[300px] mb-6'>
                            <button
                                type='button'
                                className='btn-vartalaap w-full'
                            >
                                <BufferingButtonLabel label="Processing..." />
                            </button>
                        </div>
                    </form>

                    <div className='text-center'>
                        <p className='text-xs'>
                            <span>Don&apos;t have an account? </span>
                            <Link
                                href='/register'
                                className='link'
                                prefetch={true}
                            >
                                Register
                            </Link>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
