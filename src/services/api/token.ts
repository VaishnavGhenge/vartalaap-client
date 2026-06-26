// Two separate token slots:
//   - access token: identity for the logged-in user (login/register/refresh).
//     Persisted in localStorage so a page reload can resume without a refresh
//     round-trip. The refresh token still stays in the backend's HttpOnly cookie.
//   - room token: short-lived, room-scoped guest JWT issued by the server when
//     a guest joins via ?gt= or after the host admits a knock. Lives only in
//     memory — it's tied to the current tab's call, not the device. Storing it
//     alongside the access token would (a) cause restoreAuthSession to send a
//     guest JWT to /auth/me (server 500s because the guest's "userID" is not
//     a real account), and (b) outlive the call.
const ACCESS_TOKEN_STORAGE_KEY = 'sessionly_access_token'

let _token: string | null = null
let _loaded = false
let _roomToken: string | null = null

// Listeners notified whenever either token slot changes. Long-lived consumers
// that snapshot a token (SfuSession's live SFU auth headers, the in-call
// session keepalive) subscribe here instead of polling.
type TokenListener = () => void
const tokenListeners = new Set<TokenListener>()

export function subscribeTokenChange(listener: TokenListener): () => void {
    tokenListeners.add(listener)
    return () => tokenListeners.delete(listener)
}

function notifyTokenChange(): void {
    for (const listener of tokenListeners) listener()
}

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
    notifyTokenChange()
}

export function getRoomToken(): string | null {
    return _roomToken
}

export function setRoomToken(token: string | null): void {
    _roomToken = token
    notifyTokenChange()
}
