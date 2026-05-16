export interface User {
    id: string
    email: string
    name: string
    slug: string
    timezone: string
    onboardingStep: number
    avatarUrl?: string
    // Server emits 'free' by default; plan gating reads from here in later
    // phases. Optional in TS so older cached responses don't fail to parse.
    plan?: 'free' | 'solo' | 'teams'
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
