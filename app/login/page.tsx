"use client";

import Navbar from "@/src/components/ui/Navbar";
import Link from "next/link";
import { BufferingButtonLabel } from "@/src/components/ui/BufferingButtonLabel";
import { Input } from "@/src/components/ui/input";
import { Button } from "@/src/components/ui/button";

export default function Login() {
    return (
        <div className='min-h-screen'>
            <Navbar />
            <div className='mx-auto flex max-w-7xl justify-center px-4 py-10 sm:px-6 lg:px-8 lg:py-16'>
                <div className='app-panel w-full max-w-md rounded-[2rem] p-6 sm:p-8'>
                    <h3 className='mb-2 text-center text-2xl font-semibold text-[hsl(var(--foreground))]'>
                        Log into Vartalaap
                    </h3>
                    <p className='mb-8 text-center text-sm text-[hsl(var(--muted-foreground))]'>
                        Pick your theme, sign in, and continue where your last meeting left off.
                    </p>

                    <form>
                        <div className='mb-6 w-full'>
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

                        <div className='mb-6 w-full'>
                            <Button
                                type='button'
                                variant="primary"
                                className='w-full h-11'
                            >
                                <BufferingButtonLabel label="Processing..." />
                            </Button>
                        </div>
                    </form>

                    <div className='text-center'>
                        <p className='text-xs text-[hsl(var(--muted-foreground))]'>
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
