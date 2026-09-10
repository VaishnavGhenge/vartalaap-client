import type { ReactNode } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { SearchableSelect } from "@/src/components/ui/SearchableSelect";
import { Switch } from "@/src/components/ui/Switch";
import { DAYS, type DayLabel, type DayMap, TIME_OPTIONS, formatTime12h } from "@/src/lib/availability";

const DAY_NAMES: Record<DayLabel, string> = {
    Mon: "Monday",
    Tue: "Tuesday",
    Wed: "Wednesday",
    Thu: "Thursday",
    Fri: "Friday",
    Sat: "Saturday",
    Sun: "Sunday",
};
const options = TIME_OPTIONS.map((value) => ({ value, label: formatTime12h(value) }));

interface Props {
    days: DayMap;
    editing: boolean;
    saving: boolean;
    onToggle: (day: DayLabel, enabled: boolean) => void;
    onUpdate: (day: DayLabel, index: number, field: "start" | "end", value: string) => void;
    onAdd: (day: DayLabel) => void;
    onRemove: (day: DayLabel, index: number) => void;
    renderCopy: (day: DayLabel) => ReactNode;
}

export function DailyHours({ days, editing, saving, onToggle, onUpdate, onAdd, onRemove, renderCopy }: Props) {
    return (
        <div className="divide-y divide-[hsl(var(--border))]">
            {DAYS.map((day) => {
                const { enabled, shifts } = days[day];
                return (
                    <div
                        key={day}
                        className="grid min-h-20 grid-cols-[1fr_auto] items-start gap-x-4 gap-y-3 py-5 sm:grid-cols-[150px_minmax(0,1fr)_auto]"
                    >
                        <div className="flex h-9 items-center gap-3">
                            {editing ? (
                                <Switch
                                    size="sm"
                                    checked={enabled}
                                    disabled={saving}
                                    onChange={(value) => onToggle(day, value)}
                                    aria-label={`${DAY_NAMES[day]} available`}
                                />
                            ) : (
                                <span
                                    aria-hidden="true"
                                    className={`size-2 rounded-full ${enabled ? "bg-[hsl(var(--success))]" : "bg-[hsl(var(--border))]"}`}
                                />
                            )}
                            <span className="text-sm font-medium">{DAY_NAMES[day]}</span>
                        </div>
                        <div className="col-span-2 row-start-2 min-w-0 space-y-3 sm:col-span-1 sm:col-start-2 sm:row-start-1">
                            {enabled ? (
                                shifts.map((shift, index) =>
                                    editing ? (
                                        <div key={index} className="flex items-center gap-2">
                                            <div className="min-w-0 flex-1 sm:max-w-36">
                                                <label className="sr-only" htmlFor={`hours-${day}-${index}-start`}>
                                                    {DAY_NAMES[day]} start time {index + 1}
                                                </label>
                                                <SearchableSelect
                                                    id={`hours-${day}-${index}-start`}
                                                    selectSize="default"
                                                    value={shift.start}
                                                    disabled={saving}
                                                    onValueChange={(value) => onUpdate(day, index, "start", value)}
                                                    options={options}
                                                />
                                            </div>
                                            <span className="text-xs text-[hsl(var(--muted-foreground))]">to</span>
                                            <div className="min-w-0 flex-1 sm:max-w-36">
                                                <label className="sr-only" htmlFor={`hours-${day}-${index}-end`}>
                                                    {DAY_NAMES[day]} end time {index + 1}
                                                </label>
                                                <SearchableSelect
                                                    id={`hours-${day}-${index}-end`}
                                                    selectSize="default"
                                                    value={shift.end}
                                                    disabled={saving}
                                                    onValueChange={(value) => onUpdate(day, index, "end", value)}
                                                    options={options}
                                                />
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="size-8 shrink-0"
                                                aria-label={`Remove ${DAY_NAMES[day]} hours ${index + 1}`}
                                                disabled={saving}
                                                onClick={() => onRemove(day, index)}
                                            >
                                                <X className="size-3.5" />
                                            </Button>
                                        </div>
                                    ) : (
                                        <p key={index} className="flex min-h-9 items-center text-sm tabular-nums">
                                            {formatTime12h(shift.start)}{" "}
                                            <span className="mx-3 text-[hsl(var(--muted-foreground))]">–</span>{" "}
                                            {formatTime12h(shift.end)}
                                        </p>
                                    ),
                                )
                            ) : (
                                <p className="flex min-h-9 items-center text-sm text-[hsl(var(--muted-foreground))]">
                                    Unavailable
                                </p>
                            )}
                            {enabled && editing && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="px-0 text-[hsl(var(--primary))]"
                                    onClick={() => onAdd(day)}
                                    disabled={saving}
                                >
                                    <Plus className="size-3.5" /> Add another time window
                                </Button>
                            )}
                        </div>
                        <div className="relative col-start-2 row-start-1 sm:col-start-3">
                            {enabled && editing && renderCopy(day)}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
