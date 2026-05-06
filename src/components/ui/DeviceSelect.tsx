'use client'

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
    <div className={`flex flex-col gap-1.5 ${className ?? ''}`}>
      <label htmlFor={id} className="text-xs text-[hsl(var(--muted-foreground))]">{label}</label>
      <select
        id={id}
        value={value || devices[0]?.deviceId}
        onChange={(e) => onChange(e.target.value)}
        className="w-full cursor-pointer appearance-none rounded-lg border border-[hsl(var(--border))]
                   bg-[hsl(var(--surface-2))] px-3 py-2 text-sm text-[hsl(var(--foreground))]
                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]/60"
      >
        {devices.map((d) => (
          <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
        ))}
      </select>
    </div>
  )
}
