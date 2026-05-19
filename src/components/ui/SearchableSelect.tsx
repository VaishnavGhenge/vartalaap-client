"use client";

import { Check, ChevronDown, Search } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { selectVariants } from "@/src/components/ui/select";
import { cn } from "@/src/lib/utils";

export interface SelectOption {
    value: string;
    label: string;
}

interface Props {
    options: SelectOption[];
    value: string;
    onValueChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    selectSize?: "default" | "sm";
    /** Show search input when option count exceeds this. Default: 4 */
    searchThreshold?: number;
    id?: string;
    className?: string;
    wrapperClassName?: string;
}

export function SearchableSelect({
    options,
    value,
    onValueChange,
    placeholder = "Select…",
    disabled,
    selectSize,
    searchThreshold = 4,
    id,
    className,
    wrapperClassName,
}: Props) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [highlighted, setHighlighted] = useState(0);

    const triggerRef = useRef<HTMLButtonElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const rootRef = useRef<HTMLDivElement>(null);
    const listboxId = useId();

    const showSearch = options.length > searchThreshold;
    const selectedOption = options.find((o) => o.value === value);

    const filtered = query.trim()
        ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
        : options;

    // Reset highlight to 0 (or to selected item) whenever filter changes or dropdown opens
    useEffect(() => {
        const idx = filtered.findIndex((o) => o.value === value);
        setHighlighted(idx >= 0 ? idx : 0);
    }, [query, open]); // eslint-disable-line react-hooks/exhaustive-deps

    // Focus search on open; clear query on close
    useEffect(() => {
        if (open) {
            if (showSearch) {
                // Tiny delay so the DOM is painted before focus
                requestAnimationFrame(() => searchRef.current?.focus());
            }
            // Scroll selected item into view
            requestAnimationFrame(() => {
                const idx = filtered.findIndex((o) => o.value === value);
                if (idx >= 0 && listRef.current) {
                    const item = listRef.current.children[idx] as HTMLElement | undefined;
                    item?.scrollIntoView({ block: "nearest" });
                }
            });
        } else {
            setQuery("");
        }
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    // Scroll highlighted item into view as keyboard moves it
    useEffect(() => {
        if (!open || !listRef.current) return;
        const item = listRef.current.children[highlighted] as HTMLElement | undefined;
        item?.scrollIntoView({ block: "nearest" });
    }, [highlighted, open]);

    // Click outside closes
    useEffect(() => {
        if (!open) return;
        function onPointerDown(e: PointerEvent) {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        document.addEventListener("pointerdown", onPointerDown);
        return () => document.removeEventListener("pointerdown", onPointerDown);
    }, [open]);

    function select(val: string) {
        onValueChange(val);
        setOpen(false);
        triggerRef.current?.focus();
    }

    function handleTriggerKeyDown(e: React.KeyboardEvent) {
        if (open) return; // search input handles keys when open
        if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
        }
    }

    function handleDropdownKeyDown(e: React.KeyboardEvent) {
        switch (e.key) {
            case "ArrowDown":
                e.preventDefault();
                setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
                break;
            case "ArrowUp":
                e.preventDefault();
                setHighlighted((h) => Math.max(h - 1, 0));
                break;
            case "Enter":
                e.preventDefault();
                if (filtered[highlighted]) select(filtered[highlighted].value);
                break;
            case "Escape":
                e.preventDefault();
                setOpen(false);
                triggerRef.current?.focus();
                break;
            case "Tab":
                setOpen(false);
                break;
        }
    }

    return (
        <div ref={rootRef} className={cn("relative inline-block w-full", wrapperClassName)}>
            {/* Trigger — visually identical to <Select> */}
            <button
                ref={triggerRef}
                id={id}
                type="button"
                role="combobox"
                aria-expanded={open}
                aria-haspopup="listbox"
                aria-controls={listboxId}
                disabled={disabled}
                onClick={() => setOpen((v) => !v)}
                onKeyDown={handleTriggerKeyDown}
                className={cn(
                    selectVariants({ selectSize }),
                    "text-left",
                    open && "border-[hsl(var(--primary))] ring-4 ring-[hsl(var(--primary))]/15",
                    className,
                )}
            >
                <span className={cn(
                    "block truncate",
                    !selectedOption && "text-[hsl(var(--muted-foreground))]",
                )}>
                    {selectedOption?.label ?? placeholder}
                </span>
            </button>

            {/* Chevron mirrors <Select> */}
            <ChevronDown
                aria-hidden
                className={cn(
                    "pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[hsl(var(--muted-foreground))] transition-transform duration-150",
                    selectSize === "sm" && "right-2.5 size-3.5",
                    disabled && "opacity-50",
                    open && "rotate-180",
                )}
            />

            {/* Dropdown */}
            {open && (
                <div
                    className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-xl border border-[hsl(var(--border))]/80 bg-[hsl(var(--popover))] shadow-xl"
                    onKeyDown={handleDropdownKeyDown}
                >
                    {showSearch && (
                        <div className="flex items-center gap-2 border-b border-[hsl(var(--border))]/60 px-3 py-2">
                            <Search className="size-3.5 shrink-0 text-[hsl(var(--muted-foreground))]" />
                            <input
                                ref={searchRef}
                                type="text"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search…"
                                className="flex-1 bg-transparent text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] outline-none"
                            />
                            {query && (
                                <button
                                    type="button"
                                    onClick={() => { setQuery(""); searchRef.current?.focus(); }}
                                    className="cursor-pointer rounded text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                                    aria-label="Clear search"
                                >
                                    ×
                                </button>
                            )}
                        </div>
                    )}

                    <div
                        ref={listRef}
                        role="listbox"
                        id={listboxId}
                        className="max-h-56 overflow-y-auto py-1"
                    >
                        {filtered.length === 0 ? (
                            <p className="px-3 py-5 text-center text-xs text-[hsl(var(--muted-foreground))]">
                                No matches for &ldquo;{query}&rdquo;
                            </p>
                        ) : (
                            filtered.map((opt, i) => {
                                const isSelected = opt.value === value;
                                const isHighlighted = i === highlighted;
                                return (
                                    <div
                                        key={opt.value}
                                        role="option"
                                        aria-selected={isSelected}
                                        onMouseDown={(e) => { e.preventDefault(); select(opt.value); }}
                                        onMouseEnter={() => setHighlighted(i)}
                                        className={cn(
                                            "flex cursor-pointer items-center gap-2 px-3 py-2 text-sm transition-colors",
                                            isHighlighted
                                                ? "bg-[hsl(var(--surface-2))]"
                                                : "bg-transparent",
                                            isSelected
                                                ? "text-[hsl(var(--primary))]"
                                                : "text-[hsl(var(--foreground))]",
                                        )}
                                    >
                                        <span className="flex-1 truncate">{opt.label}</span>
                                        {isSelected && (
                                            <Check className="size-3.5 shrink-0 text-[hsl(var(--primary))]" />
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
