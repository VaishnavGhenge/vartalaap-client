'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { Toaster } from 'sonner'
import { useState, useEffect } from 'react'
import { ThemeProvider } from '@/src/components/theme-provider'
import { restoreSession } from '@/src/hooks/use-auth'

function ThemedToaster() {
  return (
    <Toaster
      position="bottom-right"
      gap={8}
      toastOptions={{
        classNames: {
          toast: [
            'group !bg-[hsl(var(--card))] !text-[hsl(var(--card-foreground))]',
            '!border !border-[hsl(var(--border))]',
            '!shadow-[0_4px_24px_-4px_hsl(var(--foreground)/0.12)]',
            '!rounded-xl !text-sm !font-medium',
          ].join(' '),
          title: '!text-[hsl(var(--foreground))] !font-semibold',
          description: '!text-[hsl(var(--muted-foreground))] !font-normal',
          closeButton: [
            '!bg-[hsl(var(--muted))] !text-[hsl(var(--muted-foreground))]',
            '!border-[hsl(var(--border))] hover:!bg-[hsl(var(--surface-3))]',
          ].join(' '),
          error: '!text-[hsl(var(--foreground))]',
          success: '!text-[hsl(var(--foreground))]',
        },
      }}
    />
  )
}

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => { restoreSession() }, [])

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000, // 5 minutes
            retry: 2,
            refetchOnWindowFocus: false,
          },
          mutations: {
            retry: 1,
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        {children}
        <ThemedToaster />
        <ReactQueryDevtools initialIsOpen={false} />
      </ThemeProvider>
    </QueryClientProvider>
  )
}
