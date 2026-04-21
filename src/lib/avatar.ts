// Deterministic color for a display name. Palette intentionally excludes amber/yellow
// so the active-speaker ring stays visually distinct.
const PALETTE = [
  'bg-rose-500',
  'bg-pink-500',
  'bg-fuchsia-500',
  'bg-purple-600',
  'bg-violet-600',
  'bg-indigo-600',
  'bg-blue-600',
  'bg-sky-600',
  'bg-cyan-600',
  'bg-teal-600',
  'bg-emerald-600',
  'bg-green-600',
  'bg-lime-600',
  'bg-orange-600',
  'bg-red-600',
] as const;

export function avatarColor(name: string): string {
  const seed = name || '?';
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function initialsOf(name: string): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0][0]!.toUpperCase();
  return (parts[0][0]! + parts[parts.length - 1][0]!).toUpperCase();
}
