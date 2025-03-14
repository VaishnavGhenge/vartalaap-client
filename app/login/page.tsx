"use client";

import Navbar from "@/components/layout/Navbar";
import Link from "next/link";
import {useCallback, useEffect, useState} from "react";
import api from "@/utils/api";
import { getEmptyFormObject } from "@/utils/forms";
import { BufferingButtonLabel } from "@/components/layout/BufferingButtonLabel";
import { FormAlert } from "@/components/layout/FormAlert";
import { useRouter } from "next/navigation";
import {IUser} from "@/utils/types";
import {useRecoilState} from "recoil";
import {user} from "@/recoil/auth";

export default function Login() {
    const router = useRouter();
    const [loginData, setLoginData] = useState({
        email: "",
        password: "",
    });
    const [isLoginPending, setIsLoginPending] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [_, setUser] = useRecoilState(user);

    useEffect(() => {
        router.prefetch("/");
    }, [router]);

    const handleChange = useCallback((e: any) => {
        setLoginData((prevData) => ({
            ...prevData,
            [e.target.name]: e.target.value,
        }));
    }, []);

    const login = useCallback(() => {
        setIsLoginPending(true);

        api.login(loginData)
            .then((response: Response) => {
                if (response.ok) {
                    setFormError(null);
                    return response.json();
                }

                throw new Error("Invalid credentials");
            })
            .then((data: {  user: IUser, token: string }) => {
                setLoginData(getEmptyFormObject(loginData));
                setUser({...data.user, token: data.token});

                window.localStorage.setItem("user", JSON.stringify(data.user));

                router.push("/");
            })
            .catch((error: Error) => {
                setFormError(error.message);
                setIsLoginPending(false);
            })
            // .finally(() => {
            //     setIsLoginPending(false);
            // });
    }, [loginData, router]);

    return (
        <div className='min-h-screen'>
            <Navbar />
            <div className='flex justify-center items-center'>
                <div>
                    <h3 className='text-xl mb-6 text-center'>
                        Log into Vartalaap
                    </h3>

                    <form>
                        {formError && <FormAlert message={formError} color="red" />}

                        <div className='mb-6 w-[300px]'>
                            <div className='flex flex-col mb-2'>
                                <label htmlFor='email' className='input-label'>
                                    Email
                                </label>
                                <input
                                    type='email'
                                    id='email'
                                    name="email"
                                    className='input'
                                    placeholder='user@email.com'
                                    value={loginData.email}
                                    onChange={handleChange}
                                />
                            </div>

                            <div className='flex flex-col relative mb-2'>
                                <label
                                    htmlFor='password'
                                    className='input-label'
                                >
                                    Password
                                </label>
                                <input
                                    type='password'
                                    id='password'
                                    name="password"
                                    className='input'
                                    value={loginData.password}
                                    onChange={handleChange}
                                />
                            </div>
                        </div>

                        <div className='w-[300px] mb-6'>
                            <button
                                type='button'
                                className='btn-vartalaap w-full'
                                disabled={isLoginPending}
                                onClick={login}
                            >
                                {isLoginPending ? <BufferingButtonLabel label="Processing..." /> : <span>Login</span>}
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
