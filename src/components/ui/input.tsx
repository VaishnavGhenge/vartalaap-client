import * as React from "react"

import { cn } from "@/src/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "w-full rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--surface-2))] px-3 py-2.5 text-sm text-[hsl(var(--foreground))] outline-none transition-all",
        "focus-visible:border-[hsl(var(--primary))] focus-visible:ring-4 focus-visible:ring-[hsl(var(--primary))]/15",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "placeholder:text-[hsl(var(--muted-foreground))]",
        className
      )}
      {...props}
    />
  )
}

export { Input }
