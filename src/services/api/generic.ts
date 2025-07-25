import {httpServerUri} from "@/src/services/api/config";

function getJWTToken() {
    const user = localStorage.getItem("user");
    if (!user) {
        return null;
    }

    return JSON.parse(user).token as string;
}

export function get<T>(url: string): Promise<T> {
    // const token = getJWTToken();
    //
    // if (token) {
    //     return fetch(url, {
    //         headers: {
    //             Authorization: `Bearer ${token}`,
    //         },
    //     }) as Promise<T>;
    // }

    return fetch(`${httpServerUri}/${url}`) as Promise<T>;
}

export function post<T>(url: string, data?: any): Promise<T> {
    // const token = getJWTToken();
    //
    // if (token) {
    //     return fetch(url, {
    //         method: "POST",
    //         headers: {
    //             "Content-Type": "application/json",
    //             Authorization: `Bearer ${token}`,
    //         },
    //         body: JSON.stringify(data),
    //     }) as Promise<T>;
    // }

    return fetch(`${httpServerUri}/${url}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
    }) as Promise<T>;
}
