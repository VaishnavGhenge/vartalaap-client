"use client";

import { BufferingButtonLabel } from "@/src/components/ui/BufferingButtonLabel";
import Link from "next/link";
import { useState } from "react";
import Navbar from "@/src/components/ui/Navbar";
import { Input } from "@/src/components/ui/input";
import { Button } from "@/src/components/ui/button";

export default function Register() {
    const [registerData, setRegisterData] = useState({
        firstName: "",
        lastName: "",
        email: "",
        password: "",
        password2: "",
    });
    const [isRegisterPending, setIsRegisterPending] = useState(false);

    return (
        <div className="min-h-screen">
            <Navbar />
            <div className='flex items-center justify-center'>
                <div>
                    <h3 className='text-xl mb-6 text-center'>
                        Register on Vartalaap
                    </h3>

                    <form>
                        <div className='flex gap-4 mb-4'>
                            <div className='flex flex-col'>
                                <label
                                    htmlFor='firstName'
                                    className='input-label'
                                >
                                    First name
                                    <span className='text-red-500'>*</span>
                                </label>
                                <Input
                                    type='text'
                                    id='firstName'
                                    name='firstName'
                                    value={registerData.firstName}
                                />
                            </div>

                            <div className='flex flex-col'>
                                <label
                                    htmlFor='lastName'
                                    className='input-label'
                                >
                                    Last name
                                    <span className='text-red-500'>*</span>
                                </label>
                                <Input
                                    type='text'
                                    id='lastName'
                                    name='lastName'
                                    value={registerData.lastName}
                                />
                            </div>
                        </div>

                        <div className='flex flex-col mb-4'>
                            <label htmlFor='email' className='input-label'>
                                Email<span className='text-red-500'>*</span>
                            </label>
                            <Input
                                type='email'
                                id='email'
                                name='email'
                                placeholder='user@email.com'
                                value={registerData.email}
                            />
                        </div>

                        <div className='flex flex-col mb-4'>
                            <label htmlFor='password' className='input-label'>
                                Password(min 8)
                                <span className='text-red-500'>*</span>
                            </label>
                            <Input
                                type='password'
                                id='password'
                                name='password'
                                value={registerData.password}
                            />
                        </div>

                        <div className='flex flex-col mb-6'>
                            <label htmlFor='password2' className='input-label'>
                                Password again
                                <span className='text-red-500'>*</span>
                            </label>
                            <Input
                                type='password'
                                id='password2'
                                name='password2'
                                value={registerData.password2}
                            />
                        </div>

                        <div className='flex flex-col mb-6'>
                            <Button
                                type='button'
                                variant="primary"
                                className='w-full'
                                disabled={isRegisterPending}
                            >
                                {isRegisterPending ? (
                                    <BufferingButtonLabel label='Processing...' />
                                ) : (
                                    <span>Register</span>
                                )}
                            </Button>
                        </div>
                    </form>

                    <div className='text-center'>
                        <p className='text-xs'>
                            Already have an account?{" "}
                            <Link
                                href='/login'
                                className='link'
                                prefetch={true}
                            >
                                Login
                            </Link>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
