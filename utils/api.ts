import { httpServerUri } from "./config";

interface IRegister {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    password2: string;
}

interface ILogin {
    email: string;
    password: string;
}

function getJWTToken() {
    const user = localStorage.getItem("user");
    if (!user) {
        return null;
    }

    return JSON.parse(user).token as string;
}

function checkEmpty(data: any): Promise<boolean> {
    return new Promise((resolve, reject) => {
        Object.entries(data).forEach(([key, value]) => {
            if (value === "") {
                reject(new Error(`${key} is empty`));
            }
        });

        resolve(false);
    });
}

export function get(url: string): Promise<Response> {
    const token = getJWTToken();

    if (token) {
        return fetch(url, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });
    }

    return fetch(url);
}

export function post(url: string, data?: any): Promise<Response> {
    const token = getJWTToken();

    if (token) {
        return fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(data),
        });
    }

    return fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
    });
}

async function register(data: IRegister): Promise<Response> {
    await checkEmpty(data);
    if (data.password !== data.password2) {
        return Promise.reject(new Error("Passwords do not match"));
    }
    return await post(`${httpServerUri}/users/register`, data);
}

async function login(data: ILogin): Promise<Response> {
    await checkEmpty(data);
    return await post(`${httpServerUri}/users/login`, data);
}

const exports = {
    register,
    login,
};

export default exports;