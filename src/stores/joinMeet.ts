import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

interface JoinMeetState {
  userName: string
  meetCode: string
  isReady: boolean
  hasJoinedMeet: boolean
  
  // Actions
  setUserName: (name: string) => void
  setMeetCode: (code: string) => void
  setReady: (ready: boolean) => void
  setHasJoinedMeet: (joined: boolean) => void
  clearJoinMeet: () => void
}

export const useJoinMeetStore = create<JoinMeetState>()(
  devtools((set) => ({
    userName: '',
    meetCode: '',
    isReady: false,
    hasJoinedMeet: false,

    setUserName: (name) =>
      set(() => ({
        userName: name,
      })),
    
    setMeetCode: (code) =>
      set(() => ({
        meetCode: code,
      })),
    
    setReady: (ready) =>
      set(() => ({
        isReady: ready,
      })),
    
    setHasJoinedMeet: (joined) =>
      set(() => ({
        hasJoinedMeet: joined,
      })),
    
    clearJoinMeet: () =>
      set(() => ({
        userName: '',
        meetCode: '',
        isReady: false,
        hasJoinedMeet: false,
      })),
  }))
)