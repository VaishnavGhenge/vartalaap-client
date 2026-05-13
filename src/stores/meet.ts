import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

interface MeetState {
  currentMeet: string | null
  isMuted: boolean
  isVideoOff: boolean
  isScreenSharing: boolean

  setCurrentMeet: (meetId: string | null) => void
  toggleMute: () => void
  toggleVideo: () => void
  toggleScreenShare: () => void
  clearMeet: () => void
}

export const useMeetStore = create<MeetState>()(
  devtools((set) => ({
    currentMeet: null,
    isMuted: true,
    isVideoOff: true,
    isScreenSharing: false,

    setCurrentMeet: (meetId) => set(() => ({ currentMeet: meetId })),

    toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),

    toggleVideo: () => set((state) => ({ isVideoOff: !state.isVideoOff })),

    toggleScreenShare: () => set((state) => ({ isScreenSharing: !state.isScreenSharing })),

    clearMeet: () =>
      set(() => ({
        currentMeet: null,
        isMuted: true,
        isVideoOff: true,
        isScreenSharing: false,
      })),
  }))
)
