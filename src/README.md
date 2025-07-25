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
│   ├── socket/         # Socket.io related services
│   └── webrtc/         # WebRTC functionality
├── stores/              # Zustand state stores
├── types/               # TypeScript type definitions
└── utils/               # Utility functions
```

## 🚀 Technologies Used

- **State Management**: Zustand
- **Data Fetching**: TanStack Query (React Query)
- **Real-time Communication**: Socket.io
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

### Socket Integration
- `src/services/socket/socket.ts` - Socket service
- `src/hooks/use-socket.ts` - Socket hook

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

### Using Socket
```tsx
import { useSocket } from '@/src/hooks/use-socket'

const { socket, isConnected } = useSocket()
```

### Showing Notifications
```tsx
import { toast } from 'sonner'

toast.success('Operation completed!')
toast.error('Something went wrong')
```