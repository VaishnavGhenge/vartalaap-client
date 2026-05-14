// Access token lives in module memory only — never localStorage or a cookie.
// Lost on tab close; restored via the HttpOnly refresh cookie on boot.
let _token: string | null = null

export function getAccessToken(): string | null {
    return _token
}

export function setAccessToken(token: string | null): void {
    _token = token
}
