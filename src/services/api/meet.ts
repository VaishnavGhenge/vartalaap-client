import { httpServerUri } from '@/src/services/api/config'
import { apiFetch } from '@/src/services/api/fetch'

export interface CreateMeetResponse {
  meetCode: string
}

export function createMeet(): Promise<CreateMeetResponse> {
  return apiFetch('POST', `${httpServerUri}/meets/new`)
}
