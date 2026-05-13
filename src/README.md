# Project Structure

This project has been refactored with modern libraries and organized folder structure.

## 📁 Folder Structure

```
src/
├── components/           # React components
│   ├── features/        # Feature-specific components (Meet, etc.)
│   ├── layout/          # Layout components (Navbar, etc.)
│   ├── ui/              # Reusable UI components
│   └── providers.tsx    # App providers (React Query, etc.)
├── hooks/               # Custom React hooks
├── lib/                 # Library configurations
├── services/            # External service integrations
│   ├── api/            # API service functions
│   ├── signaling/      # WebSocket signaling client and protocol
│   └── webrtc/         # WebRTC functionality
├── stores/              # Zustand state stores
├── types/               # TypeScript type definitions
└── utils/               # Utility functions
```

## 🚀 Technologies Used

- **State Management**: Zustand
- **Data Fetching**: TanStack Query (React Query)
- **Real-time Communication**: WebSocket signaling
- **Notifications**: Sonner
- **Styling**: Tailwind CSS v4
- **WebRTC**: Custom implementation for video calls

## 🔧 Key Features

### State Management (Zustand)
- `src/stores/auth.ts` - Authentication state
- `src/stores/meet.ts` - Meeting/call state

### API Integration (TanStack Query)
- Configured in `src/components/providers.tsx`
- Custom hooks in `src/hooks/`

### Signaling Integration
- `src/services/signaling/client.ts` - WebSocket signaling client
- `src/hooks/use-signaling.ts` - Signaling lifecycle hook

### Notifications
- Sonner integrated in providers
- Used throughout the app for user feedback

## 📝 Usage Examples

### Using Auth Store
```tsx
import { useAuthStore } from '@/src/stores/auth'

const { user, isAuthenticated, login, logout } = useAuthStore()
```

### Using TanStack Query
```tsx
import { useLogin } from '@/src/hooks/use-auth'

const { mutate: login, isPending } = useLogin()
```

### Using Signaling
```tsx
import { useSignaling } from '@/src/hooks/use-signaling'

const { client, connState } = useSignaling(hasJoinedMeet)
```

### Showing Notifications
```tsx
import { toast } from 'sonner'

toast.success('Operation completed!')
toast.error('Something went wrong')
```
