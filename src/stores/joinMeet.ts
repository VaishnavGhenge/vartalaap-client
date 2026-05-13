import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'

interface JoinMeetState {
  userName: string
  meetCode: string
  hasJoinedMeet: boolean
  
  setUserName: (name: string) => void
  setMeetCode: (code: string) => void
  setHasJoinedMeet: (joined: boolean) => void
  clearJoinMeet: () => void
}

export const useJoinMeetStore = create<JoinMeetState>()(
  devtools(
    persist(
      (set) => ({
        userName: '',
        meetCode: '',
        hasJoinedMeet: false,

        setUserName: (name) => set(() => ({ userName: name })),
        setMeetCode: (code) => set(() => ({ meetCode: code })),
        setHasJoinedMeet: (joined) => set(() => ({ hasJoinedMeet: joined })),

        clearJoinMeet: () =>
          set(() => ({
            // userName intentionally kept — auto-fills on next visit
            meetCode: '',
            hasJoinedMeet: false,
          })),
      }),
      {
        name: 'vartalaap-join',
        partialize: (state) => ({ userName: state.userName }),
      }
    )
  )
)
