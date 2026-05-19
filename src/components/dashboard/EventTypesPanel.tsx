"use client";

import { ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/src/components/ui/button";
import { EditActionBar } from "@/src/components/ui/EditActionBar";
import { ConfirmDialog } from "@/src/components/ui/ConfirmDialog";
import { FieldError, FormError } from "@/src/components/ui/FormError";
import { Input } from "@/src/components/ui/input";
import { Select } from "@/src/components/ui/select";
import { ApiError } from "@/src/services/api/fetch";
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
    const [deleteTarget, setDeleteTarget] = useState<EventType | null>(null);
    const [deletePending, setDeletePending] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

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

    async function handleDelete() {
        if (!deleteTarget?.id) return;
        setDeletePending(true);
        setDeleteError(null);
        try {
            await deleteEventType(deleteTarget.id);
            setDeleteTarget(null);
            void refresh();
            onChange?.();
        } catch (e) {
            setDeleteError(e instanceof Error ? e.message : "Could not delete");
        } finally {
            setDeletePending(false);
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
                        onDelete={() => {
                            setDeleteError(null);
                            setDeleteTarget(evt);
                        }}
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
            <ConfirmDialog
                open={deleteTarget !== null}
                title="Delete event type?"
                description={
                    deleteTarget
                        ? `${deleteTarget.title} will be removed from your booking page. Existing bookings remain.`
                        : undefined
                }
                confirmLabel="Delete"
                loadingLabel="Deleting..."
                destructive
                pending={deletePending}
                error={deleteError}
                onConfirm={handleDelete}
                onOpenChange={(open) => {
                    if (deletePending) return;
                    if (!open) {
                        setDeleteTarget(null);
                        setDeleteError(null);
                    }
                }}
            />
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
                        <Link href={publicHref} target="_blank" rel="noopener noreferrer">
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

const BUFFER_OPTIONS = [0, 5, 10, 15, 30, 60] as const;
const NOTICE_OPTIONS = [0, 1, 2, 4, 8, 24, 48, 72] as const;   // hours
const MAX_DAYS_OPTIONS = [0, 7, 14, 30, 60, 90, 180, 365] as const;
const MAX_PER_DAY_OPTIONS = [1, 2, 3, 4, 5, 6, 8, 10] as const;

function bufferLabel(min: number) { return min === 0 ? "None" : `${min} min`; }
function noticeLabel(h: number) {
    if (h === 0) return "None";
    if (h < 24) return `${h} hr`;
    return `${h / 24} day${h / 24 > 1 ? "s" : ""}`;
}
function maxDaysLabel(d: number) { return d === 0 ? "Unlimited" : `${d} day${d !== 1 ? "s" : ""}`; }

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
    const [bufferAfter, setBufferAfter] = useState<number>(initial?.bufferMin ?? 0);
    const [bufferBefore, setBufferBefore] = useState<number>(initial?.bufferBeforeMin ?? 0);
    const [maxPerDay, setMaxPerDay] = useState<number | undefined>(initial?.maxPerDay);
    const [minNoticeHours, setMinNoticeHours] = useState<number>(initial?.minNoticeHours ?? 0);
    const [maxDaysAhead, setMaxDaysAhead] = useState<number>(initial?.maxDaysAhead ?? 0);
    const [isActive, setIsActive] = useState<boolean>(initial?.isActive ?? true);
    const [description, setDescription] = useState<string>(initial?.description ?? "");
    const [slugTouched, setSlugTouched] = useState(false);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

    const editing = !!initial?.id;
    const computedSlug = useMemo(() => slugify(title), [title]);

    function handleTitle(v: string) {
        setTitle(v);
        setFieldErrors((prev) => ({ ...prev, title: "" }));
        if (!slugTouched && !editing) setSlug(slugify(v));
    }
    function handleSlug(v: string) {
        setSlug(slugify(v));
        setFieldErrors((prev) => ({ ...prev, slug: "" }));
        setSlugTouched(true);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);
        setFormError(null);
        setFieldErrors({});
        try {
            const payload: EventType = {
                slug: slug || computedSlug,
                title: title.trim(),
                durationMin: duration,
                bufferMin: bufferAfter,
                bufferBeforeMin: bufferBefore,
                maxPerDay,
                minNoticeHours,
                maxDaysAhead,
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
            if (err instanceof ApiError && err.field) {
                setFieldErrors({ [err.field]: err.message });
            } else {
                setFormError(err instanceof Error ? err.message : "Could not save");
            }
        } finally {
            setSaving(false);
        }
    }

    const titleError = fieldErrors.title;
    const slugError = fieldErrors.slug;

    return (
        <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-4 rounded-xl border border-[hsl(var(--border))]/70 bg-[hsl(var(--surface-2))] p-4"
        >
            {/* Title + URL */}
            <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                    <label htmlFor="evt-title" className="label-caps">Title</label>
                    <Input
                        id="evt-title"
                        value={title}
                        onChange={(e) => handleTitle(e.target.value)}
                        placeholder="Intro call"
                        required
                        aria-invalid={!!titleError}
                        aria-describedby={titleError ? "evt-title-error" : undefined}
                        className={titleError ? "border-[hsl(var(--destructive))] focus-visible:border-[hsl(var(--destructive))] focus-visible:ring-[hsl(var(--destructive))]/15" : undefined}
                    />
                    <FieldError id="evt-title-error">{titleError}</FieldError>
                </div>
                <div className="flex flex-col gap-1.5">
                    <label htmlFor="evt-slug" className="label-caps">URL slug</label>
                    <Input
                        id="evt-slug"
                        value={slug}
                        onChange={(e) => handleSlug(e.target.value)}
                        placeholder="intro-call"
                        required
                        aria-invalid={!!slugError}
                        aria-describedby={slugError ? "evt-slug-error" : undefined}
                        className={slugError ? "border-[hsl(var(--destructive))] focus-visible:border-[hsl(var(--destructive))] focus-visible:ring-[hsl(var(--destructive))]/15" : undefined}
                    />
                    <FieldError id="evt-slug-error">{slugError}</FieldError>
                </div>
            </div>

            {/* Description */}
            <div className="flex flex-col gap-1.5">
                <label htmlFor="evt-desc" className="label-caps">Description (optional)</label>
                <Input
                    id="evt-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What guests can expect"
                />
            </div>

            {/* Duration + buffers */}
            <div>
                <p className="label-caps mb-2 text-[hsl(var(--muted-foreground))]">Duration &amp; buffers</p>
                <div className="grid gap-3 sm:grid-cols-3">
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
                        <label htmlFor="evt-buf-before" className="label-caps">Buffer before</label>
                        <Select
                            id="evt-buf-before"
                            value={String(bufferBefore)}
                            onChange={(e) => setBufferBefore(Number(e.target.value))}
                        >
                            {BUFFER_OPTIONS.map((b) => (
                                <option key={b} value={b}>{bufferLabel(b)}</option>
                            ))}
                        </Select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label htmlFor="evt-buf-after" className="label-caps">Buffer after</label>
                        <Select
                            id="evt-buf-after"
                            value={String(bufferAfter)}
                            onChange={(e) => setBufferAfter(Number(e.target.value))}
                        >
                            {BUFFER_OPTIONS.map((b) => (
                                <option key={b} value={b}>{bufferLabel(b)}</option>
                            ))}
                        </Select>
                    </div>
                </div>
            </div>

            {/* Scheduling limits */}
            <div>
                <p className="label-caps mb-2 text-[hsl(var(--muted-foreground))]">Scheduling limits</p>
                <div className="grid gap-3 sm:grid-cols-3">
                    <div className="flex flex-col gap-1.5">
                        <label htmlFor="evt-notice" className="label-caps">Min notice</label>
                        <Select
                            id="evt-notice"
                            value={String(minNoticeHours)}
                            onChange={(e) => setMinNoticeHours(Number(e.target.value))}
                        >
                            {NOTICE_OPTIONS.map((h) => (
                                <option key={h} value={h}>{noticeLabel(h)}</option>
                            ))}
                        </Select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label htmlFor="evt-maxdays" className="label-caps">Max days ahead</label>
                        <Select
                            id="evt-maxdays"
                            value={String(maxDaysAhead)}
                            onChange={(e) => setMaxDaysAhead(Number(e.target.value))}
                        >
                            {MAX_DAYS_OPTIONS.map((d) => (
                                <option key={d} value={d}>{maxDaysLabel(d)}</option>
                            ))}
                        </Select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label htmlFor="evt-maxperday" className="label-caps">Max per day</label>
                        <Select
                            id="evt-maxperday"
                            value={maxPerDay === undefined ? "" : String(maxPerDay)}
                            onChange={(e) => setMaxPerDay(e.target.value === "" ? undefined : Number(e.target.value))}
                        >
                            <option value="">Unlimited</option>
                            {MAX_PER_DAY_OPTIONS.map((n) => (
                                <option key={n} value={n}>{n}</option>
                            ))}
                        </Select>
                    </div>
                </div>
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

            <FormError>{formError}</FormError>

            <EditActionBar
                className="justify-end"
                onCancel={onCancel}
                cancelDisabled={saving}
                saveType="submit"
                saveLabel={editing ? "Save" : "Create"}
                saving={saving}
            />
        </form>
    );
}
