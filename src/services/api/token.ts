// Access token is cached in memory and persisted in localStorage so a page
// reload can resume without waiting for refresh-token rotation. The refresh
// token still stays in the backend's HttpOnly cookie.
const ACCESS_TOKEN_STORAGE_KEY = 'sessionly_access_token'

let _token: string | null = null
let _loaded = false

function readStoredAccessToken(): string | null {
    if (typeof window === 'undefined') return null
    try {
        return window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)
    } catch {
        return null
    }
}

function writeStoredAccessToken(token: string | null): void {
    if (typeof window === 'undefined') return
    try {
        if (token) {
            window.localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token)
        } else {
            window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY)
        }
    } catch {
        // Storage can be unavailable in private/locked-down contexts. Keep
        // memory auth working and let refresh-cookie restore handle reloads.
    }
}

export function getAccessToken(): string | null {
    if (!_loaded) {
        _token = readStoredAccessToken()
        _loaded = true
    }
    return _token
}

export function setAccessToken(token: string | null): void {
    _token = token
    _loaded = true
    writeStoredAccessToken(token)
}
