import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

interface MeetState {
  currentMeet: string | null
  isMuted: boolean
  isVideoOff: boolean
  isScreenSharing: boolean
  isKnocking: boolean
  roomClosesAt: string | null // ISO 8601 UTC — null for instant rooms

  setCurrentMeet: (meetId: string | null) => void
  setRoomClosesAt: (iso: string | null) => void
  toggleMute: () => void
  toggleVideo: () => void
  toggleScreenShare: () => void
  setIsKnocking: (v: boolean) => void
  clearMeet: () => void
}

export const useMeetStore = create<MeetState>()(
  devtools((set) => ({
    currentMeet: null,
    isMuted: true,
    isVideoOff: true,
    isScreenSharing: false,
    isKnocking: false,
    roomClosesAt: null,

    setCurrentMeet: (meetId) => set(() => ({ currentMeet: meetId })),
    setRoomClosesAt: (iso) => set(() => ({ roomClosesAt: iso })),

    toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),

    toggleVideo: () => set((state) => ({ isVideoOff: !state.isVideoOff })),

    toggleScreenShare: () => set((state) => ({ isScreenSharing: !state.isScreenSharing })),

    setIsKnocking: (v) => set(() => ({ isKnocking: v })),

    clearMeet: () =>
      set(() => ({
        currentMeet: null,
        isMuted: true,
        isVideoOff: true,
        isScreenSharing: false,
        isKnocking: false,
        roomClosesAt: null,
      })),
  }))
)
