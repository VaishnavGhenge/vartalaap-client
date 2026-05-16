import * as React from "react"
import { ChevronDown } from "lucide-react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/src/lib/utils"

const selectVariants = cva(
  [
    "w-full cursor-pointer appearance-none border border-[hsl(var(--input))]",
    "bg-[hsl(var(--surface-2))] text-[hsl(var(--foreground))] shadow-sm outline-none",
    "transition-all hover:border-[hsl(var(--border))] hover:bg-[hsl(var(--surface-3))]/70",
    "focus-visible:border-[hsl(var(--primary))] focus-visible:ring-4 focus-visible:ring-[hsl(var(--primary))]/15",
    "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
    "[&>option]:bg-[hsl(var(--popover))] [&>option]:text-[hsl(var(--popover-foreground))]",
  ].join(" "),
  {
    variants: {
      selectSize: {
        default: "h-10 rounded-xl px-3 py-2.5 pr-9 text-sm",
        sm: "h-8 rounded-lg px-2.5 py-1.5 pr-8 text-xs",
      },
    },
    defaultVariants: {
      selectSize: "default",
    },
  }
)

type SelectProps = Omit<React.ComponentProps<"select">, "size"> &
  VariantProps<typeof selectVariants> & {
    wrapperClassName?: string
  }

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, wrapperClassName, selectSize, disabled, children, ...props }, ref) => {
    return (
      <div className={cn("relative inline-block w-full", wrapperClassName)}>
        <select
          ref={ref}
          data-slot="select"
          disabled={disabled}
          className={cn(selectVariants({ selectSize }), className)}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[hsl(var(--muted-foreground))] transition-colors",
            selectSize === "sm" && "right-2.5 size-3.5",
            disabled && "opacity-50"
          )}
        />
      </div>
    )
  }
)
Select.displayName = "Select"

export { Select, selectVariants }
