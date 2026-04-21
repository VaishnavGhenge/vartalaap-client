const serverDomain = process.env.NEXT_PUBLIC_SERVER_DOMAIN ?? 'localhost:8080'
const isSecure = process.env.NEXT_PUBLIC_SERVER_SECURE === 'true'

export const httpServerUri = `${isSecure ? 'https' : 'http'}://${serverDomain}`
export const wsServerUri = `${isSecure ? 'wss' : 'ws'}://${serverDomain}/ws`
