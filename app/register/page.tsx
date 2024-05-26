"use client";

import { BufferingButtonLabel } from "@/components/layout/BufferingButtonLabel";
import { FormAlert } from "@/components/layout/FormAlert";
import Link from "next/link";
import { useCallback, useState } from "react";
import api from "@/utils/api";
import { getEmptyFormObject } from "@/utils/forms";
import Navbar from "@/components/layout/Navbar";

export default function Register() {
    const [registerData, setRegisterData] = useState({
        firstName: "",
        lastName: "",
        email: "",
        password: "",
        password2: "",
    });
    const [isRegisterPending, setIsRegisterPending] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    const handleChange = useCallback((e: any) => {
        setRegisterData((prevData) => ({
            ...prevData,
            [e.target.name]: e.target.value,
        }));
    }, []);

    const register = useCallback(() => {
        setIsRegisterPending(true);

        api.register(registerData)
            .then((response: Response) => {
                if (response.ok) {
                    setFormError(null);
                    return response.json();
                }

                throw new Error("Registration failed");
            })
            .then((data: { message: string; user: any }) => {
                setRegisterData(getEmptyFormObject(registerData));
            })
            .catch((error: Error) => {
                setFormError(error.message);
            })
            .finally(() => {
                setIsRegisterPending(false);
            });
    }, [registerData]);

    return (
        <div className="min-h-screen">
            <Navbar />
            <div className='flex items-center justify-center'>
                <div>
                    <h3 className='text-xl mb-6 text-center'>
                        Register on Vartalaap
                    </h3>

                    <form>
                        {formError && (
                            <FormAlert message={formError} color='red' />
                        )}

                        <div className='flex gap-4 mb-4'>
                            <div className='flex flex-col'>
                                <label
                                    htmlFor='firstName'
                                    className='input-label'
                                >
                                    First name
                                    <span className='text-red-500'>*</span>
                                </label>
                                <input
                                    type='text'
                                    id='firstName'
                                    name='firstName'
                                    className='input'
                                    value={registerData.firstName}
                                    onChange={handleChange}
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
                                <input
                                    type='text'
                                    id='lastName'
                                    name='lastName'
                                    className='input'
                                    value={registerData.lastName}
                                    onChange={handleChange}
                                />
                            </div>
                        </div>

                        <div className='flex flex-col mb-4'>
                            <label htmlFor='email' className='input-label'>
                                Email<span className='text-red-500'>*</span>
                            </label>
                            <input
                                type='email'
                                id='email'
                                name='email'
                                className='input'
                                placeholder='user@email.com'
                                value={registerData.email}
                                onChange={handleChange}
                            />
                        </div>

                        <div className='flex flex-col mb-4'>
                            <label htmlFor='password' className='input-label'>
                                Password(min 8)
                                <span className='text-red-500'>*</span>
                            </label>
                            <input
                                type='password'
                                id='password'
                                name='password'
                                className='input'
                                value={registerData.password}
                                onChange={handleChange}
                            />
                        </div>

                        <div className='flex flex-col mb-6'>
                            <label htmlFor='password2' className='input-label'>
                                Password again
                                <span className='text-red-500'>*</span>
                            </label>
                            <input
                                type='password'
                                id='password2'
                                name='password2'
                                className='input'
                                value={registerData.password2}
                                onChange={handleChange}
                            />
                        </div>

                        <div className='flex flex-col mb-6'>
                            <button
                                type='button'
                                className='btn-vartalaap w-full'
                                onClick={register}
                                disabled={isRegisterPending}
                            >
                                {isRegisterPending ? (
                                    <BufferingButtonLabel label='Processing...' />
                                ) : (
                                    <span>Register</span>
                                )}
                            </button>
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
