/**
 * The archive's data contract.
 *
 * MyHUB is assembled from three real public datasets (see docs/SOURCES.md). The
 * build-time ETL in tools/etl.mjs is the ONLY thing that reads those CSVs; it
 * emits src/data/archive.json, which is a static module compiled into the
 * bundle. At runtime there is no fetch, no API and no database — the engine in
 * src/lib/engine derives every link, thread and pattern from the receipts in
 * memory.
 *
 * ── Why `provenance` is on every receipt ─────────────────────────────────────
 * The three sources cover music and money richly, places and entertainment
 * partially, and photos/messages/searches not at all. Rather than quietly
 * invent the missing categories and present them as fact, every receipt states
 * whether it was READ from a dataset or RECONSTRUCTED from one. The UI prints
 * that distinction, so the archive is always honest about how much it actually
 * knows — and the difference becomes something to explore rather than a caveat
 * buried in a README.
 */

/** The nine kinds of moment the brief asks for. */
export type ReceiptKind =
  | 'music'
  | 'movie'
  | 'place'
  | 'purchase'
  | 'photo'
  | 'message'
  | 'search'
  | 'event'
  | 'note';

export const RECEIPT_KINDS: readonly ReceiptKind[] = [
  'music', 'movie', 'place', 'purchase', 'photo', 'message', 'search', 'event', 'note',
] as const;

/** Which dataset a receipt came out of. */
export type SourceId = 'spotify' | 'household' | 'cards';

/**
 * `observed` — every field traces to a row in a source dataset.
 * `reconstructed` — the engine inferred this moment from observed rows (a photo
 * inferred from a trip, a search inferred from a first-ever play). The UI must
 * always stamp these; they are readings, not records.
 */
export type Provenance = 'observed' | 'reconstructed';

/** A printed line item: label, value. Rendered as label · · · · · value. */
export interface ReceiptLine {
  label: string;
  value: string;
}

export interface Receipt {
  /** Stable, source-prefixed: `mus-00412`, `hh-0231`, `cd-1180`. */
  id: string;
  kind: ReceiptKind;
  /** Local wall-clock ISO, no zone: `YYYY-MM-DDTHH:mm`. Sorts lexically. */
  at: string;
  /** The headline. Never empty — the ETL drops a row it cannot title. */
  title: string;
  /** Secondary line: artist, merchant, route. Absent rather than empty. */
  detail?: string;
  /** Free text the source actually carried (a transaction note, a lyric). */
  body?: string;
  /** Printed line items, already formatted as strings by the ETL. */
  lines?: ReceiptLine[];
  /** INR. Only ever present on money receipts, and only when the row had it. */
  amount?: number;
  /** Place label as the source wrote it. The household set anonymises these
   *  ("Place 5"), which is preserved rather than dressed up. */
  place?: string;
  /** Indian city from the card ledger, when the row carried one. There is no
   *  state field on purpose: the source's city→state pairing is scrambled (294
   *  of its 311 cities appear under more than one state, and Ludhiana is filed
   *  under Manipur), so it is not shipped. See docs/SOURCES.md. */
  city?: string;
  /**
   * The join keys. Lowercased, punctuation-stripped tokens shared across
   * receipts — an artist name, a merchant, a category, a place. This is what
   * the link engine matches on, so its quality decides the quality of every
   * connection in the app.
   */
  entities: string[];
  /** Thematic tags the engine and the filters read: `night`, `travel`, … */
  tags: string[];
  source: SourceId;
  provenance: Provenance;
  /** For reconstructed receipts: the ids of the observed receipts it rests on. */
  basis?: string[];
}

/** Why two receipts are connected. Each carries a printable reason. */
export type LinkKind =
  /** Same calendar day. */
  | 'same-day'
  /** Within a few hours of each other. */
  | 'adjacent'
  /** A shared entity token (artist, merchant, category, place). */
  | 'shared-entity'
  /** Same place or city. */
  | 'same-place'
  /** An intent followed by a spend: search → purchase, within a window. */
  | 'intent-to-act'
  /** The same track or artist recurring after a long absence. */
  | 'recurrence'
  /** A reconstructed receipt and the observed receipt it was derived from. */
  | 'derived-from';

export interface Link {
  a: string;
  b: string;
  kind: LinkKind;
  /** 0–1. Drives edge weight in the constellation and thread ranking. */
  weight: number;
  /** Printable, e.g. "SHARED: THE BEATLES · 3H APART". Never empty. */
  reason: string;
}

/**
 * A thread is the app's answer to the brief's core challenge: several receipts
 * of different kinds that together read as one moment. Derived, not authored.
 */
export interface Thread {
  id: string;
  /** Derived from the thread's own contents, never a generic string. */
  title: string;
  /** ISO date of the earliest receipt. */
  start: string;
  end: string;
  receiptIds: string[];
  kinds: ReceiptKind[];
  links: Link[];
  /** 0–1 — how strongly this cluster hangs together. Ranks the thread list. */
  strength: number;
  /** One sentence naming what makes the cluster a moment. */
  caption: string;
}

/** A curated era. Boundaries are a curatorial call; every figure is computed. */
export interface Chapter {
  id: string;
  /** "THE BEATLES YEARS" */
  title: string;
  /** Inclusive year range. */
  fromYear: number;
  toYear: number;
  /** The claim the chapter makes about who the person was. */
  thesis: string;
  /** Longer narration, 2–4 sentences. */
  body: string;
}

export interface ChapterStats {
  chapterId: string;
  receipts: number;
  byKind: Partial<Record<ReceiptKind, number>>;
  topArtists: Array<{ name: string; plays: number }>;
  topEntities: Array<{ name: string; count: number }>;
  /** 0–23 → share of that chapter's receipts. Length 24. */
  hourProfile: number[];
  spend: number;
  /** Median hour of activity, as a formatted clock string. */
  medianHourLabel: string;
}

/** A mined regularity. The evidence ids let the UI prove every claim. */
export interface Pattern {
  id: string;
  /** "YOU LIVE BETWEEN 22:00 AND 04:00" */
  title: string;
  /** The supporting sentence. */
  detail: string;
  /** The single number the pattern turns on, pre-formatted. */
  figure: string;
  figureLabel: string;
  /** Receipts that demonstrate it — the UI links straight to them. */
  evidence: string[];
  kinds: ReceiptKind[];
}

/** Precomputed aggregates over the FULL source rows, not just shipped receipts.
 *  The Spotify export has 149,860 plays; shipping them all would be absurd, but
 *  a histogram over all of them is 24 numbers and is the truest thing the app
 *  can say about when this person was awake. */
export interface Aggregates {
  /** Plays by hour of day, 0–23, over all 149,860 rows. */
  playsByHour: number[];
  /** Plays by weekday (0 = Sunday) × hour, for the heatmap. 7 × 24. */
  playsByWeekdayHour: number[][];
  /** `YYYY-MM` → play count, over the full export. */
  playsByMonth: Record<string, number>;
  /** Year → the artists that defined it. */
  artistsByYear: Record<string, Array<{ name: string; plays: number }>>;
  /** Top artists over the whole decade. */
  topArtists: Array<{ name: string; plays: number }>;
  topTracks: Array<{ name: string; artist: string; plays: number }>;
  /** `YYYY-MM` → total INR spent, from both money datasets. */
  spendByMonth: Record<string, number>;
  /** Category → INR, from both money datasets. */
  spendByCategory: Record<string, number>;
  totalListeningHours: number;
  totalPlays: number;
  skipRate: number;
}

/** What each dataset contributed — printed on the archive's front page. */
export interface SourceLedger {
  id: SourceId;
  /** The filename as shipped in the zip. */
  file: string;
  label: string;
  /** What it is, in one line. */
  what: string;
  rows: number;
  /** Receipts this source produced after the ETL. */
  receipts: number;
  span: string;
  /** Which kinds it feeds. */
  feeds: ReceiptKind[];
  /** Honest note on what had to be dropped or inferred. */
  caveat: string;
}

export interface Archive {
  meta: {
    /**
     * The archive owner.
     *
     * Earlier drafts lifted this from a row of the card file, which made the
     * owner a demographic guess and every reading of the ledgers an argument
     * about whether that guess fit. It is now a named person with dated
     * anchors, and the anchors are the point: they come from the owner's own
     * record rather than from any CSV, which is what lets a chapter say *which
     * year of school* a ledger stops in instead of inferring an age from a
     * spending pattern.
     *
     * There is no date of birth here because none was given, and a guessed one
     * would be the exact kind of invented fact /sources exists to rule out.
     */
    owner: {
      name: string;
      /** Current standing. Short — the rail gives it one truncating line. */
      work: string;
      /** Where that standing is held. */
      at: string;
      /**
       * Verified year anchors, earliest first. The only facts in this archive
       * that do not come from a source file, and the Sources page says so.
       */
      anchors: { label: string; year: number; note?: string }[];
    };
    /** Earliest and latest receipt, ISO dates. */
    from: string;
    to: string;
    receipts: number;
    /** Wall-clock years the archive spans. */
    years: number;
    builtFrom: string[];
  };
  receipts: Receipt[];
  aggregates: Aggregates;
  sources: SourceLedger[];
}
