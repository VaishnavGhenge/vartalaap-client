export interface User {
    id: string
    email: string
    name: string
    slug: string
    timezone: string
    onboardingStep: number
    avatarUrl?: string
}

export interface UserCredentials {
    email: string
    password: string
}

export interface RegisterCredentials {
    name: string
    email: string
    password: string
}

export interface AuthResponse {
    accessToken: string
    user: User
}
