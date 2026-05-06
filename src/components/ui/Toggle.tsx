'use client'

import { cn } from '@/src/lib/utils'

interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
  disabled?: boolean
  id?: string
}

export function Toggle({ checked, onChange, label, description, disabled, id }: ToggleProps) {
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex cursor-pointer items-center justify-between gap-3 rounded-xl',
        'border border-[hsl(var(--border)/0.4)] bg-[hsl(var(--surface-2))]/60',
        'px-4 py-3 transition-colors hover:bg-[hsl(var(--surface-2))]',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{label}</span>
        {description && (
          <span className="text-xs text-[hsl(var(--muted-foreground))]">{description}</span>
        )}
      </div>

      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--surface))]',
          'disabled:cursor-not-allowed',
          checked ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--border))]',
        )}
      >
        <span
          className={cn(
            'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-5' : 'translate-x-0',
          )}
        />
      </button>
    </label>
  )
}
