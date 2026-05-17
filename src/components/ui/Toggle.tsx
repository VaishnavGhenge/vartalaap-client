'use client'

import { Switch } from '@/src/components/ui/Switch'
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
      <Switch id={id} checked={checked} onChange={onChange} disabled={disabled} />
    </label>
  )
}
