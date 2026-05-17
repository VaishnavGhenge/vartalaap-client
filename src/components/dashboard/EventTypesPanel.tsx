"use client";

import { ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { BufferingButtonLabel } from "@/src/components/ui/BufferingButtonLabel";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Select } from "@/src/components/ui/select";
import {
    createEventType,
    deleteEventType,
    listEventTypes,
    updateEventType,
    type EventType,
} from "@/src/services/api/event-types";

const DURATIONS = [15, 30, 45, 60, 90, 120] as const;

function slugify(name: string): string {
    return name.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

interface Props {
    hostSlug: string | null;
    onChange?: () => void;
}

// Event-types list with inline create + edit + delete. Free-plan limits are
// enforced server-side (1 active type, paid types disabled); we surface the
// server's verbatim error message rather than rebuild the rule client-side so
// the constraint has exactly one source of truth.
export function EventTypesPanel({ hostSlug, onChange }: Props) {
    const [events, setEvents] = useState<EventType[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [editingId, setEditingId] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);

    async function refresh() {
        setLoading(true);
        setLoadError(null);
        try {
            const next = await listEventTypes();
            setEvents(next);
        } catch (e) {
            setLoadError(e instanceof Error ? e.message : "Could not load event types");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { void refresh(); }, []);

    function handleEdited() {
        setEditingId(null);
        void refresh();
        onChange?.();
    }
    function handleCreated() {
        setCreating(false);
        void refresh();
        onChange?.();
    }

    async function handleDelete(id: string) {
        if (!confirm("Delete this event type? Existing bookings remain but new ones can't be created.")) {
            return;
        }
        try {
            await deleteEventType(id);
            void refresh();
            onChange?.();
        } catch (e) {
            alert(e instanceof Error ? e.message : "Could not delete");
        }
    }

    if (loading) {
        return <p className="text-sm text-[hsl(var(--muted-foreground))]">Loading event types…</p>;
    }
    if (loadError) {
        return <p className="text-sm text-[hsl(var(--destructive))]">{loadError}</p>;
    }

    return (
        <div className="flex flex-col gap-3">
            {events.length === 0 && !creating && (
                <p className="text-sm text-[hsl(var(--muted-foreground))]">
                    No event types yet. Create one so guests can book.
                </p>
            )}

            {events.map((evt) =>
                editingId === evt.id ? (
                    <EventTypeForm
                        key={evt.id}
                        initial={evt}
                        onCancel={() => setEditingId(null)}
                        onSaved={handleEdited}
                    />
                ) : (
                    <EventTypeRow
                        key={evt.id}
                        event={evt}
                        hostSlug={hostSlug}
                        onEdit={() => setEditingId(evt.id ?? null)}
                        onDelete={() => evt.id && handleDelete(evt.id)}
                    />
                ),
            )}

            {creating ? (
                <EventTypeForm onCancel={() => setCreating(false)} onSaved={handleCreated} />
            ) : (
                <Button
                    variant="outline"
                    size="sm"
                    className="self-start"
                    onClick={() => setCreating(true)}
                >
                    <Plus className="size-4" /> New event type
                </Button>
            )}
        </div>
    );
}

function EventTypeRow({
    event, hostSlug, onEdit, onDelete,
}: {
    event: EventType;
    hostSlug: string | null;
    onEdit: () => void;
    onDelete: () => void;
}) {
    const publicHref = hostSlug ? `/u/${hostSlug}/${event.slug}` : null;
    return (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-[hsl(var(--border))]/70 bg-[hsl(var(--surface-2))] px-4 py-3">
            <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[hsl(var(--foreground))]">
                    {event.title}
                </p>
                <p className="mt-0.5 truncate text-xs text-[hsl(var(--muted-foreground))]">
                    {event.durationMin} min
                    {event.bufferMin > 0 ? ` · ${event.bufferMin} min buffer` : ""}
                    {event.isActive ? "" : " · paused"}
                </p>
            </div>
            <div className="flex items-center gap-1">
                {publicHref && event.isActive && (
                    <Button asChild variant="ghost" size="sm">
                        <Link href={publicHref} target="_blank">
                            <ExternalLink className="size-3.5" />
                        </Link>
                    </Button>
                )}
                <Button variant="ghost" size="sm" onClick={onEdit} aria-label="Edit">
                    <Pencil className="size-3.5" />
                </Button>
                <Button variant="ghost" size="sm" onClick={onDelete} aria-label="Delete">
                    <Trash2 className="size-3.5" />
                </Button>
            </div>
        </div>
    );
}

function EventTypeForm({
    initial, onCancel, onSaved,
}: {
    initial?: EventType;
    onCancel: () => void;
    onSaved: () => void;
}) {
    const [title, setTitle] = useState(initial?.title ?? "");
    const [slug, setSlug] = useState(initial?.slug ?? "");
    const [duration, setDuration] = useState<number>(initial?.durationMin ?? 30);
    const [buffer, setBuffer] = useState<number>(initial?.bufferMin ?? 0);
    const [isActive, setIsActive] = useState<boolean>(initial?.isActive ?? true);
    const [description, setDescription] = useState<string>(initial?.description ?? "");
    const [slugTouched, setSlugTouched] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const editing = !!initial?.id;
    const computedSlug = useMemo(() => slugify(title), [title]);

    function handleTitle(v: string) {
        setTitle(v);
        if (!slugTouched && !editing) setSlug(slugify(v));
    }
    function handleSlug(v: string) {
        setSlug(slugify(v));
        setSlugTouched(true);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);
        setError(null);
        try {
            const payload: EventType = {
                slug: slug || computedSlug,
                title: title.trim(),
                durationMin: duration,
                bufferMin: buffer,
                isPaid: false,
                isActive,
                description: description.trim() || undefined,
            };
            if (editing && initial?.id) {
                await updateEventType(initial.id, payload);
            } else {
                await createEventType(payload);
            }
            onSaved();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not save");
        } finally {
            setSaving(false);
        }
    }

    return (
        <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-3 rounded-xl border border-[hsl(var(--border))]/70 bg-[hsl(var(--surface-2))] p-4"
        >
            <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                    <label htmlFor="evt-title" className="label-caps">Title</label>
                    <Input
                        id="evt-title"
                        value={title}
                        onChange={(e) => handleTitle(e.target.value)}
                        placeholder="Intro call"
                        required
                    />
                </div>
                <div className="flex flex-col gap-1.5">
                    <label htmlFor="evt-slug" className="label-caps">URL</label>
                    <Input
                        id="evt-slug"
                        value={slug}
                        onChange={(e) => handleSlug(e.target.value)}
                        placeholder="intro-call"
                        required
                    />
                </div>
                <div className="flex flex-col gap-1.5">
                    <label htmlFor="evt-duration" className="label-caps">Duration</label>
                    <Select
                        id="evt-duration"
                        value={String(duration)}
                        onChange={(e) => setDuration(Number(e.target.value))}
                    >
                        {DURATIONS.map((d) => (
                            <option key={d} value={d}>{d} min</option>
                        ))}
                    </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                    <label htmlFor="evt-buffer" className="label-caps">Buffer</label>
                    <Select
                        id="evt-buffer"
                        value={String(buffer)}
                        onChange={(e) => setBuffer(Number(e.target.value))}
                    >
                        {[0, 5, 10, 15, 30].map((b) => (
                            <option key={b} value={b}>{b === 0 ? "None" : `${b} min`}</option>
                        ))}
                    </Select>
                </div>
            </div>

            <div className="flex flex-col gap-1.5">
                <label htmlFor="evt-desc" className="label-caps">Description (optional)</label>
                <Input
                    id="evt-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What guests can expect"
                />
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
                <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="size-3.5 accent-[hsl(var(--primary))]"
                />
                Accept bookings
            </label>

            {error && <p className="text-xs text-[hsl(var(--destructive))]">{error}</p>}

            <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
                    Cancel
                </Button>
                <Button type="submit" size="sm" disabled={saving}>
                    {saving ? <BufferingButtonLabel label="Saving…" /> : editing ? "Save" : "Create"}
                </Button>
            </div>
        </form>
    );
}
