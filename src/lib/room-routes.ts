const ROOM_PREFIX = "/room"

export function roomPath(meetCode: string): string {
  return `${ROOM_PREFIX}/${meetCode}`
}

export function normalizeMeetCodeInput(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ""

  try {
    const looksLikeUrl = trimmed.includes("://") || trimmed.includes(".") || trimmed.includes("/")
    if (looksLikeUrl) {
      const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`)
      const segments = url.pathname.split("/").filter(Boolean)
      if (segments[0]?.toLowerCase() === "room") {
        return (segments[1] ?? "").toLowerCase()
      }
      return (segments[0] ?? "").toLowerCase()
    }
  } catch {
    // Fall through to plain path parsing.
  }

  const segments = trimmed.split("/").filter(Boolean)
  if (segments[0]?.toLowerCase() === "room") {
    return (segments[1] ?? "").toLowerCase()
  }
  return (segments[0] ?? "").toLowerCase()
}
