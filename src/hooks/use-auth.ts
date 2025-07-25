import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuthStore } from '@/src/stores/auth'

interface LoginData {
  email: string
  password: string
}

interface RegisterData {
  name: string
  email: string
  password: string
}

// Mock API functions - replace with actual API calls
const loginUser = async (data: LoginData) => {
  // Replace with actual API call
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  
  if (!response.ok) {
    throw new Error('Login failed')
  }
  
  return response.json()
}

const registerUser = async (data: RegisterData) => {
  // Replace with actual API call
  const response = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  
  if (!response.ok) {
    throw new Error('Registration failed')
  }
  
  return response.json()
}

export const useLogin = () => {
  const { login, setLoading } = useAuthStore()
  
  return useMutation({
    mutationFn: loginUser,
    onMutate: () => {
      setLoading(true)
    },
    onSuccess: (data) => {
      login(data.user)
      toast.success('Successfully logged in!')
    },
    onError: (error) => {
      setLoading(false)
      toast.error(error.message || 'Login failed')
    },
  })
}

export const useRegister = () => {
  const { login, setLoading } = useAuthStore()
  
  return useMutation({
    mutationFn: registerUser,
    onMutate: () => {
      setLoading(true)
    },
    onSuccess: (data) => {
      login(data.user)
      toast.success('Account created successfully!')
    },
    onError: (error) => {
      setLoading(false)
      toast.error(error.message || 'Registration failed')
    },
  })
}

export const useAuth = () => {
  const { user, isAuthenticated, isLoading, logout } = useAuthStore()
  
  const handleLogout = () => {
    logout()
    toast.success('Logged out successfully')
  }
  
  return {
    user,
    isAuthenticated,
    isLoading,
    logout: handleLogout,
  }
}