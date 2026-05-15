import { useMutation } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { login, logout, register, refreshSession } from '@/src/services/api/auth'
import { useAuthStore } from '@/src/stores/auth'
import type { RegisterCredentials, UserCredentials } from '@/src/types/auth'

export const useLogin = () => {
    const { login: storeLogin } = useAuthStore()
    const router = useRouter()

    return useMutation({
        mutationFn: (creds: UserCredentials) => login(creds),
        onSuccess: ({ user }) => {
            storeLogin(user)
            // Resume onboarding if not complete
            router.push(user.onboardingStep < 5 ? '/onboarding' : '/dashboard')
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
    const { user, isAuthenticated, isLoading } = useAuthStore()
    const handleLogout = useLogout()
    return { user, isAuthenticated, isLoading, logout: handleLogout }
}

// Call once on app boot to restore session from the HttpOnly refresh cookie.
export async function restoreSession() {
    const { login: storeLogin, logout: storeLogout, setLoading } = useAuthStore.getState()
    setLoading(true)
    const resp = await refreshSession()
    if (resp) {
        storeLogin(resp.user)
    } else {
        storeLogout()
    }
}
