import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

interface JoinMeetState {
  userName: string
  meetCode: string
  isReady: boolean
  
  // Actions
  setUserName: (name: string) => void
  setMeetCode: (code: string) => void
  setReady: (ready: boolean) => void
  clearJoinMeet: () => void
}

export const useJoinMeetStore = create<JoinMeetState>()(
  devtools((set) => ({
    userName: '',
    meetCode: '',
    isReady: false,

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
    
    clearJoinMeet: () =>
      set(() => ({
        userName: '',
        meetCode: '',
        isReady: false,
      })),
  }))
)