import { useMutation } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { login, logout, register, restoreAuthSession, getMe } from '@/src/services/api/auth'
import { useAuthStore } from '@/src/stores/auth'
import type { RegisterCredentials, UserCredentials } from '@/src/types/auth'

// Reads the ?next= return path from the current URL. Only internal absolute
// paths are honored ("/room/abc") — anything else (full URLs, protocol-
// relative "//evil.com") is dropped to keep this from becoming an open
// redirect.
export function safeNextPath(): string | null {
    if (typeof window === 'undefined') return null
    return safeInternalPath(new URLSearchParams(window.location.search).get('next'))
}

export function safeInternalPath(next: string | null): string | null {
    if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return null
    if (['/login', '/register', '/auth/google/callback'].includes(next.split(/[?#]/)[0])) return null
    return next
}

export function useAuthRedirect() {
    const { isLoading, isAuthenticated, user } = useAuthStore()
    const router = useRouter()
    useEffect(() => {
        if (isLoading || !isAuthenticated || !user) return
        const next = safeNextPath()
        const destination = user.onboardingStep < 5 && next?.split(/[?#]/)[0] !== '/onboarding'
            ? `/onboarding${next ? `?next=${encodeURIComponent(next)}` : ''}`
            : next ?? '/dashboard'
        router.replace(destination)
    }, [isLoading, isAuthenticated, user, router])
}

export const useLogin = () => {
    const { login: storeLogin } = useAuthStore()

    return useMutation({
        mutationFn: (creds: UserCredentials) => login(creds),
        onSuccess: ({ user }) => {
            storeLogin(user)
        },
        onError: (err: Error) => {
            toast.error(err.message || 'Login failed')
        },
    })
}

export const useRegister = () => {
    const { login: storeLogin } = useAuthStore()

    return useMutation({
        mutationFn: (creds: RegisterCredentials) => register(creds),
        onSuccess: ({ user }) => {
            storeLogin(user)
        },
        onError: (err: Error) => {
            toast.error(err.message || 'Registration failed')
        },
    })
}

export const useLogout = () => {
    const { logout: storeLogout } = useAuthStore()
    const router = useRouter()

    return () => {
        logout().finally(() => {
            storeLogout()
            router.push('/login')
        })
    }
}

export const useAuth = () => {
    const { user, isAuthenticated, isLoading, setUser } = useAuthStore()
    const handleLogout = useLogout()
    async function refreshUser() {
        try {
            const fresh = await getMe()
            setUser(fresh)
        } catch { /* silently ignore — user stays as-is */ }
    }
    return { user, isAuthenticated, isLoading, logout: handleLogout, refreshUser }
}

// Call once on app boot to restore from local access-token storage first, then
// fall back to the HttpOnly refresh cookie if that token is missing or expired.
export async function restoreSession() {
    const { login: storeLogin, logout: storeLogout, setLoading } = useAuthStore.getState()
    setLoading(true)
    try {
        const resp = await restoreAuthSession()
        if (resp) storeLogin(resp.user)
        else storeLogout()
    } catch {
        toast.error('Could not reconnect to your account. Please retry when your connection is back.')
    } finally {
        setLoading(false)
    }
}
