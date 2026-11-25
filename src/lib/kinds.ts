import type { LucideIcon } from 'lucide-react';
import {
  Music, Film, MapPin, ShoppingBag, Camera,
  MessageSquare, Search, CalendarDays, StickyNote,
} from 'lucide-react';
import type { ReceiptKind } from '@/lib/types';

/**
 * One definition of each receipt kind, shared by every view — the roll, the
 * threads, the constellation, the dial and the story. A kind's icon and colour
 * are decided here once so a music receipt is the same object on all five.
 *
 * ── Why the colour assignment is what it is ──────────────────────────────────
 * The design system ships a six-step categorical ramp and there are nine kinds,
 * so three of them have to share. Rather than pick three arbitrary collisions,
 * the split carries information: the six kinds that come straight out of a
 * source dataset each get a ramp step, and the three the engine *reconstructs*
 * all take --level-0, the neutral grey. So colour encodes provenance — a page
 * of grey marks is a page of inference — and the icon still tells the three
 * apart. One decision, two jobs, no tenth colour.
 */
export interface KindDef {
  kind: ReceiptKind;
  /** Singular, for a single receipt's header. */
  label: string;
  /** Plural, for filters and counts. */
  plural: string;
  icon: LucideIcon;
  /** A CSS var reference, so it re-inks with the surface like everything else. */
  color: string;
  /** What the receipt represents, printed on the kind filter. */
  gloss: string;
}

export const KIND_DEFS: Record<ReceiptKind, KindDef> = {
  music: {
    kind: 'music',
    label: 'Play',
    plural: 'Music',
    icon: Music,
    color: 'var(--level-2)',
    gloss: 'Listening sessions from the streaming export',
  },
  movie: {
    kind: 'movie',
    label: 'Screen',
    plural: 'Screen',
    icon: Film,
    color: 'var(--level-3)',
    gloss: 'Subscriptions, tickets and entertainment spend',
  },
  place: {
    kind: 'place',
    label: 'Place',
    plural: 'Places',
    icon: MapPin,
    color: 'var(--level-4)',
    gloss: 'Journeys and the cities a card was used in',
  },
  purchase: {
    kind: 'purchase',
    label: 'Purchase',
    plural: 'Purchases',
    icon: ShoppingBag,
    color: 'var(--level-5)',
    gloss: 'Cash and card transactions, to the rupee',
  },
  note: {
    kind: 'note',
    label: 'Note',
    plural: 'Notes',
    icon: StickyNote,
    color: 'var(--level-1)',
    gloss: 'What was written in the ledger by hand',
  },
  event: {
    kind: 'event',
    label: 'Event',
    plural: 'Events',
    icon: CalendarDays,
    color: 'var(--accent-rose)',
    gloss: 'Salaries, farewells, festivals — the dated milestones',
  },
  photo: {
    kind: 'photo',
    label: 'Frame',
    plural: 'Photos',
    icon: Camera,
    color: 'var(--level-0)',
    gloss: 'Reconstructed from journeys the ledger recorded',
  },
  message: {
    kind: 'message',
    label: 'Message',
    plural: 'Messages',
    icon: MessageSquare,
    color: 'var(--level-0)',
    gloss: 'Reconstructed from gifts, transfers and farewells',
  },
  search: {
    kind: 'search',
    label: 'Search',
    plural: 'Searches',
    icon: Search,
    color: 'var(--level-0)',
    gloss: 'Reconstructed from first encounters and pre-spend intent',
  },
};

/** Display order: observed kinds first, reconstructed last. */
export const KIND_ORDER: readonly ReceiptKind[] = [
  'music', 'purchase', 'place', 'movie', 'note', 'event', 'photo', 'message', 'search',
] as const;

export function kindDef(kind: ReceiptKind): KindDef {
  return KIND_DEFS[kind] ?? KIND_DEFS.note;
}
