import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import React, { type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ─── Mocks (all hoisted before hook imports) ─────────────────────────────────
const pushMock = vi.fn()
vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: pushMock }),
}))

const toastErrorMock = vi.fn()
vi.mock('sonner', () => ({
    toast: { error: (msg: string) => toastErrorMock(msg) },
}))

vi.mock('@/src/services/api/auth', () => ({
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    restoreAuthSession: vi.fn(),
    getMe: vi.fn(),
}))

import { useLogin, useRegister, useLogout, useAuth, restoreSession } from '../use-auth'
import * as authApi from '@/src/services/api/auth'
import { useAuthStore } from '@/src/stores/auth'
import type { User } from '@/src/types/auth'

const mocked = {
    login: vi.mocked(authApi.login),
    register: vi.mocked(authApi.register),
    logout: vi.mocked(authApi.logout),
    restoreAuthSession: vi.mocked(authApi.restoreAuthSession),
    getMe: vi.mocked(authApi.getMe),
}

const onboardedUser: User = {
    id: 'u-1', email: 'a@b.com', name: 'Alice', slug: 'alice',
    timezone: 'UTC', onboardingStep: 5,
}
const onboardingUser: User = { ...onboardedUser, id: 'u-2', onboardingStep: 2 }

function wrapper({ children }: { children: ReactNode }) {
    // Fresh QueryClient per render so retries/cache don't leak between tests.
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
    pushMock.mockReset()
    toastErrorMock.mockReset()
    mocked.login.mockReset()
    mocked.register.mockReset()
    mocked.logout.mockReset()
    mocked.restoreAuthSession.mockReset()
    mocked.getMe.mockReset()
    // Reset the global Zustand store so prior tests don't bleed user state.
    useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: true })
})

// ─── useLogin ────────────────────────────────────────────────────────────────
// THE branch worth pinning: routing after login depends on the user's
// onboardingStep. A fully-onboarded user (>=5) goes to /dashboard; anyone
// still mid-onboarding goes back to /onboarding so they don't bypass setup
// just by re-logging in.

it('useLogin success with onboarded user routes to /dashboard and updates the store', async () => {
    mocked.login.mockResolvedValue({ accessToken: 't', user: onboardedUser })

    const { result } = renderHook(() => useLogin(), { wrapper })
    act(() => {
        result.current.mutate({ email: 'a@b.com', password: 'pw' })
    })
    await waitFor(() => {
        expect(pushMock).toHaveBeenCalledWith('/dashboard')
    })
    expect(useAuthStore.getState().user).toEqual(onboardedUser)
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
})

it('useLogin success with mid-onboarding user routes back to /onboarding', async () => {
    mocked.login.mockResolvedValue({ accessToken: 't', user: onboardingUser })

    const { result } = renderHook(() => useLogin(), { wrapper })
    act(() => {
        result.current.mutate({ email: 'a@b.com', password: 'pw' })
    })
    await waitFor(() => {
        expect(pushMock).toHaveBeenCalledWith('/onboarding')
    })
})

// Login failure must surface a toast AND NOT update the store. Without
// the second half, a failed login could still leave the store thinking
// the user is authed (whatever it was before this attempt).
it('useLogin failure shows a toast and does not authenticate', async () => {
    mocked.login.mockRejectedValue(new Error('bad credentials'))

    const { result } = renderHook(() => useLogin(), { wrapper })
    act(() => {
        result.current.mutate({ email: 'a@b.com', password: 'pw' })
    })
    await waitFor(() => {
        expect(toastErrorMock).toHaveBeenCalledWith('bad credentials')
    })
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(pushMock).not.toHaveBeenCalled()
})

// ─── useRegister ─────────────────────────────────────────────────────────────
// Registration always goes to /onboarding regardless of any other state —
// a new user starts fresh.
it('useRegister success authenticates and routes to /onboarding', async () => {
    mocked.register.mockResolvedValue({ accessToken: 't', user: onboardingUser })

    const { result } = renderHook(() => useRegister(), { wrapper })
    act(() => {
        result.current.mutate({ name: 'Alice', email: 'a@b.com', password: 'pw' })
    })
    await waitFor(() => {
        expect(pushMock).toHaveBeenCalledWith('/onboarding')
    })
    expect(useAuthStore.getState().user).toEqual(onboardingUser)
})

it('useRegister failure shows toast and does not authenticate', async () => {
    mocked.register.mockRejectedValue(new Error('email taken'))

    const { result } = renderHook(() => useRegister(), { wrapper })
    act(() => {
        result.current.mutate({ name: 'Alice', email: 'a@b.com', password: 'pw' })
    })
    await waitFor(() => {
        expect(toastErrorMock).toHaveBeenCalledWith('email taken')
    })
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
})

// ─── useLogout ───────────────────────────────────────────────────────────────
// The crucial property: client-side cleanup happens REGARDLESS of whether the
// server-side logout succeeds. A user clicking "log out" must always end up
// logged out locally, even if the network is down. Test both paths.
it('useLogout clears the store and routes to /login on server success', async () => {
    useAuthStore.getState().login(onboardedUser)
    mocked.logout.mockResolvedValue(undefined)

    const { result } = renderHook(() => useLogout())
    await act(async () => {
        await result.current()
    })

    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(useAuthStore.getState().user).toBeNull()
    expect(pushMock).toHaveBeenCalledWith('/login')
})

// NOT TESTED: "useLogout still clears the store when the server call rejects".
//
// The hook is written as:
//
//     return () => {
//         logout().finally(() => { storeLogout(); router.push('/login') })
//     }
//
// — no .catch on the inner promise, and the returned value is undefined.
// `.finally()` doesn't swallow rejections, so a rejected logout() surfaces as
// an unhandled rejection. This is a small product wart that would benefit
// from a .catch(() => {}) on the inner call. Without one, the test can't
// cleanly observe the failure path without leaving the runner with an
// unhandled-rejection warning that breaks the run.
//
// Intent left uncovered: "the user is logged out locally regardless of
// server outcome". The success-path test above pins the happy path.

// ─── restoreSession (boot path) ──────────────────────────────────────────────
// On app boot, restoreSession decides whether the user is logged in. Two
// branches matter:
//   1. Session restored → store has the user, isLoading=false
//   2. No session → store cleared, isLoading=false
// AND in both cases isLoading must end up false — a stuck spinner means the
// app permanently shows the loading splash.

it('restoreSession with a live session populates the store', async () => {
    mocked.restoreAuthSession.mockResolvedValue({ accessToken: 't', user: onboardedUser })
    await restoreSession()
    expect(useAuthStore.getState().user).toEqual(onboardedUser)
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
    expect(useAuthStore.getState().isLoading).toBe(false)
})

it('restoreSession with no session clears the store and stops loading', async () => {
    mocked.restoreAuthSession.mockResolvedValue(null)
    await restoreSession()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().isLoading).toBe(false)
})

// ─── useAuth.refreshUser ─────────────────────────────────────────────────────
// refreshUser silently swallows /me failures: the existing user must remain
// in the store so a transient API hiccup doesn't sign the user out. This is
// the documented behaviour ("silently ignore — user stays as-is").
it('useAuth.refreshUser leaves the existing user in place if /me fails', async () => {
    useAuthStore.getState().login(onboardedUser)
    mocked.getMe.mockRejectedValue(new Error('5xx'))

    const { result } = renderHook(() => useAuth())
    await act(async () => {
        await result.current.refreshUser()
    })

    expect(useAuthStore.getState().user).toEqual(onboardedUser)
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
})

// On success, refreshUser updates the user object — used after profile edits
// (slug change, name change) so the dashboard reflects them without a reload.
it('useAuth.refreshUser updates the store with the fresh /me payload', async () => {
    useAuthStore.getState().login(onboardedUser)
    const fresher = { ...onboardedUser, name: 'Alice Renamed' }
    mocked.getMe.mockResolvedValue(fresher)

    const { result } = renderHook(() => useAuth())
    await act(async () => {
        await result.current.refreshUser()
    })

    expect(useAuthStore.getState().user).toEqual(fresher)
})
