import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { User } from '@/src/types/auth'

interface AuthState {
    user: User | null
    isAuthenticated: boolean
    isLoading: boolean
    login: (user: User) => void
    logout: () => void
    setLoading: (loading: boolean) => void
}

export const useAuthStore = create<AuthState>()(
    devtools(
        (set) => ({
            user: null,
            isAuthenticated: false,
            isLoading: true, // true on boot until refresh attempt completes
            login: (user) => set({ user, isAuthenticated: true, isLoading: false }),
            logout: () => set({ user: null, isAuthenticated: false, isLoading: false }),
            setLoading: (isLoading) => set({ isLoading }),
        }),
        { name: 'auth' }
    )
)
