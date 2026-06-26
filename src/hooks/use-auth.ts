import { useMutation } from '@tanstack/react-query'
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
    const next = new URLSearchParams(window.location.search).get('next')
    if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return null
    return next
}

export const useLogin = () => {
    const { login: storeLogin } = useAuthStore()
    const router = useRouter()

    return useMutation({
        mutationFn: (creds: UserCredentials) => login(creds),
        onSuccess: ({ user }) => {
            storeLogin(user)
            // Resume onboarding if not complete; otherwise honor a ?next=
            // return path (e.g. back to the call a session-expired user was
            // trying to join) before defaulting to the dashboard.
            router.push(user.onboardingStep < 5 ? '/onboarding' : safeNextPath() ?? '/dashboard')
        },
        onError: (err: Error) => {
            toast.error(err.message || 'Login failed')
        },
    })
}

export const useRegister = () => {
    const { login: storeLogin } = useAuthStore()
    const router = useRouter()

    return useMutation({
        mutationFn: (creds: RegisterCredentials) => register(creds),
        onSuccess: ({ user }) => {
            storeLogin(user)
            router.push('/onboarding')
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
    const resp = await restoreAuthSession()
    if (resp) {
        storeLogin(resp.user)
    } else {
        storeLogout()
    }
}
