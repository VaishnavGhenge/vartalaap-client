'use client'

import { cn } from "@/src/lib/utils"
import { Select } from "@/src/components/ui/select"

interface DeviceSelectProps {
  label: string
  devices: { deviceId: string; label: string }[]
  value: string
  onChange: (deviceId: string) => void
  id?: string
  className?: string
}

export function DeviceSelect({ label, devices, value, onChange, id, className }: DeviceSelectProps) {
  if (devices.length === 0) return null
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-xs text-[hsl(var(--muted-foreground))]">{label}</label>
      <Select
        id={id}
        value={value || devices[0]?.deviceId}
        onChange={(e) => onChange(e.target.value)}
      >
        {devices.map((d) => (
          <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
        ))}
      </Select>
    </div>
  )
}
