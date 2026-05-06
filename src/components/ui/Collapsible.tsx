'use client'

import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/src/lib/utils'

interface CollapsibleProps {
  label: string
  children: React.ReactNode
  defaultOpen?: boolean
  // Persist open/closed state across page loads.
  storageKey?: string
  className?: string
}

function readStorage(key: string, fallback: boolean): boolean {
  try { return localStorage.getItem(key) === 'true' } catch { return fallback }
}

function writeStorage(key: string, value: boolean): void {
  try { localStorage.setItem(key, String(value)) } catch { /* noop */ }
}

export function Collapsible({ label, children, defaultOpen = false, storageKey, className }: CollapsibleProps) {
  const [open, setOpen] = useState(() =>
    storageKey ? readStorage(storageKey, defaultOpen) : defaultOpen
  )

  useEffect(() => {
    if (storageKey) writeStorage(storageKey, open)
  }, [open, storageKey])

  return (
    <div className={cn('flex flex-col', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="group flex items-center gap-1.5 self-start py-1 text-xs
                   text-[hsl(var(--muted-foreground))] transition-colors
                   hover:text-[hsl(var(--foreground))]
                   focus-visible:outline-none focus-visible:ring-2
                   focus-visible:ring-[hsl(var(--ring))]/60 rounded"
      >
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 transition-transform duration-200',
            open && 'rotate-180',
          )}
          aria-hidden
        />
        {label}
      </button>

      {/*
        CSS grid row animation: 0fr collapses the inner div to 0 height,
        1fr expands it to its natural height — no JS measurement needed.
      */}
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-in-out"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div className="px-1 pb-1 pt-2">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
