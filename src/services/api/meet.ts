import { httpServerUri } from '@/src/services/api/config'

export interface CreateMeetResponse {
  meetCode: string
}

export async function createMeet(): Promise<CreateMeetResponse> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(`${httpServerUri}/meets/new`, {
      method: 'POST',
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`meets/new ${res.status}`)
    return await res.json() as CreateMeetResponse
  } finally {
    clearTimeout(timeout)
  }
}
