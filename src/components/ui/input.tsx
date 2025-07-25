import * as React from "react"

import { cn } from "@/src/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "text-sm bg-slate-100 text-black rounded px-3 py-2 w-full border-0 outline-none transition-all",
        "active:outline-sky-700 focus-visible:outline-sky-700 focus-visible:outline-2",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "placeholder:text-gray-500",
        className
      )}
      {...props}
    />
  )
}

export { Input }
