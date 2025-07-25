export interface User {
    email: string;
}

export interface UserCredentials {
    email: string;
    password: string;
}

export interface LoginResponse {
    token: string;
    user: User;
}