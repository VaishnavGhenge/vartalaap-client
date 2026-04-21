import { httpServerUri } from './config'

export interface IceServer {
  urls: string[]
  username?: string
  credential?: string
}

export async function fetchIceServers(): Promise<IceServer[]> {
  const res = await fetch(`${httpServerUri}/ice-servers`, { method: 'POST' })
  if (!res.ok) throw new Error(`ice-servers failed: ${res.status}`)
  const body = (await res.json()) as { iceServers: IceServer[] }
  return body.iceServers
}
