function getJWTToken() {
    const user = localStorage.getItem("user");
    if (!user) {
        return null;
    }

    return JSON.parse(user).token as string;
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
