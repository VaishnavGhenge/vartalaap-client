import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

interface Participant {
  id: string
  name: string
  avatar?: string
  isMuted: boolean
  isVideoOff: boolean
  isConnected: boolean
}

interface MeetState {
  currentMeet: string | null
  participants: Participant[]
  isConnected: boolean
  isMuted: boolean
  isVideoOff: boolean
  isScreenSharing: boolean
  
  // Actions
  setCurrentMeet: (meetId: string | null) => void
  addParticipant: (participant: Participant) => void
  removeParticipant: (participantId: string) => void
  updateParticipant: (participantId: string, updates: Partial<Participant>) => void
  setConnectionStatus: (connected: boolean) => void
  toggleMute: () => void
  toggleVideo: () => void
  toggleScreenShare: () => void
  clearMeet: () => void
}

export const useMeetStore = create<MeetState>()(
  devtools((set) => ({
    currentMeet: null,
    participants: [],
    isConnected: false,
    isMuted: true,
    isVideoOff: true,
    isScreenSharing: false,

    setCurrentMeet: (meetId) =>
      set(() => ({
        currentMeet: meetId,
      })),
    
    addParticipant: (participant) =>
      set((state) => ({
        participants: [...state.participants, participant],
      })),
    
    removeParticipant: (participantId) =>
      set((state) => ({
        participants: state.participants.filter((p) => p.id !== participantId),
      })),
    
    updateParticipant: (participantId, updates) =>
      set((state) => ({
        participants: state.participants.map((p) =>
          p.id === participantId ? { ...p, ...updates } : p
        ),
      })),
    
    setConnectionStatus: (connected) =>
      set(() => ({
        isConnected: connected,
      })),
    
    toggleMute: () =>
      set((state) => ({
        isMuted: !state.isMuted,
      })),
    
    toggleVideo: () =>
      set((state) => ({
        isVideoOff: !state.isVideoOff,
      })),
    
    toggleScreenShare: () =>
      set((state) => ({
        isScreenSharing: !state.isScreenSharing,
      })),
    
    clearMeet: () =>
      set(() => ({
        currentMeet: null,
        participants: [],
        isConnected: false,
        isScreenSharing: false,
      })),
  }))
)