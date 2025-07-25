import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'

interface User {
  id: string
  name: string
  email: string
  avatar?: string
}

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
    persist(
      (set) => ({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        login: (user) =>
          set(() => ({
            user,
            isAuthenticated: true,
            isLoading: false,
          })),
        logout: () =>
          set(() => ({
            user: null,
            isAuthenticated: false,
            isLoading: false,
          })),
        setLoading: (loading) =>
          set(() => ({
            isLoading: loading,
          })),
      }),
      {
        name: 'auth-storage',
      }
    )
  )
)