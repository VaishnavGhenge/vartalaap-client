'use client'

import * as React from 'react'

import { cn } from '@/src/lib/utils'

type SwitchSize = 'sm' | 'default'

interface SwitchProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'type'> {
    checked: boolean
    onChange: (checked: boolean) => void
    size?: SwitchSize
}

const SIZE_CLASSES: Record<SwitchSize, { track: string; knob: string; shift: string }> = {
    sm:      { track: 'h-5 w-9',  knob: 'h-4 w-4', shift: 'translate-x-4' },
    default: { track: 'h-6 w-11', knob: 'h-5 w-5', shift: 'translate-x-5' },
}

export function Switch({
    checked,
    onChange,
    disabled,
    size = 'default',
    className,
    ...rest
}: SwitchProps) {
    const dims = SIZE_CLASSES[size]
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={cn(
                'press relative shrink-0 cursor-pointer rounded-full transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--surface))]',
                'disabled:cursor-not-allowed disabled:opacity-50',
                dims.track,
                checked ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--border))]',
                className,
            )}
            {...rest}
        >
            <span
                className={cn(
                    'pointer-events-none absolute left-0.5 top-0.5 inline-block rounded-full bg-white shadow transition-transform',
                    dims.knob,
                    checked ? dims.shift : 'translate-x-0',
                )}
            />
        </button>
    )
}
