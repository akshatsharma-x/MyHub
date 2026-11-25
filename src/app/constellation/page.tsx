'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { coOccurrences, ENTITY_GRAPH, receiptById } from '@/lib/engine';
import { useOverlay } from '@/lib/OverlayContext';
import { clip, dateLabel, num, plural } from '@/lib/format';
import { kindDef, KIND_ORDER } from '@/lib/kinds';
import type { EntityNode } from '@/lib/engine';
import type { Receipt, ReceiptKind } from '@/lib/types';
import { KindIcon } from '@/components/receipt/KindIcon';
import { Chip } from '@/components/ui/Chip';
import { Slug } from '@/components/ui/Slug';

/**
 * Constellation — what is connected to what, across the whole decade.
 *
 * The nodes are entities, not receipts. See src/lib/engine/entities.ts for why
 * that decision is the difference between a graph and a hairball.
 *
 * ── The layout, and why it is not a force simulation ──────────────────────────
 * A physics layout is the default choice here and it is the wrong one twice over.
 * It is non-deterministic, so the picture is different on every load and nothing
 * about it can be described or reasoned about; and its positions are meaningless,
 * so the reader learns to ignore where things are and reads only the lines.
 *
 * This layout is a sector dial. Each receipt kind owns an angular sector sized to
 * how many of its entities are on the graph, and within a sector an entity's
 * radius is set by its rank — the biggest names sit nearest the centre. So
 * position carries two real facts before a single edge is drawn: *what kind of
 * thing this is* (angle) and *how much of the archive it accounts for* (radius).
 * It is computed once, with no RNG, and it is identical on every load.
 */

const CENTRE = 500;
const R_MIN = 88;
const R_MAX = 410;
/** Where the sector name is printed. Outside every node, inside the viewBox. */
const R_LABEL = 452;

/* ── Why every name on this dial is HTML and not <text> ────────────────────────
   SVG text scales with the viewBox. The column this sits in is about 600px at xl
   and 820px at the widest the shell ever gets, so a 14-unit label in a 1480-unit
   box renders at 5.7px — and this language's floor is 11px for anything carrying
   a fact. Rather than pick a unit size that is legible at one width and wrong at
   every other, the geometry stays in the SVG and the type sits in an absolutely
   positioned layer over it, set in CSS pixels. `pos()` is the whole bridge: a
   user-unit coordinate becomes a percentage of the rendered box, which is exact
   because the SVG is `w-full h-auto` and so keeps the box's aspect.

   The box is deliberately wider than the dial it holds. The dial and its rim
   anchors span 904 units, so each side gets a gutter of 288 units — 116px at xl,
   where the column is 596px.

   What that gutter has to hold, measured in the browser at xl rather than
   estimated: the binding label is the purchases sector's, 104px wide, which
   leaves **12px** of clearance inside this box. Every focused node name is
   slacker than that — the worst is 51px — because `clip()` caps them at 16
   characters and most sit well inside the rim. So the kind labels are the
   constraint, not the node names.

   12px sounds thin and is not, because this box is not the visible edge: the
   `.k-paper` panel around it adds 16px of padding and a 2px rule, so a label has
   28px to cross before it touches ink, and nothing overflows at any width (the
   gutter only grows from here — 55px of clearance at the shell's widest).

   The trade being made: widening the box buys label room and shrinks the dial,
   since the dial is a fixed 904 units of a growing viewBox. Going to 1585 would
   double the clearance and cost the dial 7% of its diameter, which is the wrong
   way round — the dial is the content. Shrink the box instead and the purchases
   label is the first thing to run out of the panel. */
const BOX_X = -240;
const BOX_Y = -20;
const BOX_W = 1480;
const BOX_H = 1030;
const BOX = `${BOX_X} ${BOX_Y} ${BOX_W} ${BOX_H}`;

/** A viewBox coordinate as a percentage of the rendered box. */
function pos(x: number, y: number): { left: string; top: string } {
  return {
    left: `${((x - BOX_X) / BOX_W) * 100}%`,
    top: `${((y - BOX_Y) / BOX_H) * 100}%`,
  };
}

/** Anchoring for a label placed radially outward from the hub: horizontal on the
 *  sides, vertical at the top and bottom, so a name never sits on its own node. */
function radialShift(cos: number, sin: number): string {
  const side = cos > 0.3 || cos < -0.3;
  const tx = cos > 0.3 ? '0%' : cos < -0.3 ? '-100%' : '-50%';
  const ty = side ? '-50%' : sin < 0 ? '-100%' : '0%';
  return `translate(${tx}, ${ty})`;
}

interface Placed extends EntityNode {
  x: number;
  y: number;
  r: number;
  /** Where the in-place name goes: outward from the hub, so the labels fan apart
   *  by angle instead of stacking above nodes that are already near each other. */
  labelX: number;
  labelY: number;
  cos: number;
  sin: number;
}

interface Sector {
  kind: ReceiptKind;
  /** Boundary angles, for the divider rules. */
  from: number;
  to: number;
  /** Where the name goes. */
  labelX: number;
  labelY: number;
  cos: number;
  sin: number;
  count: number;
}

function layout(nodes: EntityNode[]): { placed: Placed[]; sectors: Sector[] } {
  // Kinds in the shared display order, so the sectors run round the dial in the
  // same sequence as every legend in the product.
  const present = KIND_ORDER.filter((k) => nodes.some((n) => n.kind === k));
  const total = nodes.length || 1;

  const placed: Placed[] = [];
  const sectors: Sector[] = [];
  let angleCursor = -Math.PI / 2; // start at twelve o'clock

  for (const kind of present) {
    const group = nodes
      .filter((n) => n.kind === kind)
      .sort((a, b) => b.count - a.count || (a.name < b.name ? -1 : 1));
    const span = (group.length / total) * Math.PI * 2;

    group.forEach((node, i) => {
      // Rank sets the radius: the names that account for most of the archive sit
      // nearest the hub.
      const t = group.length === 1 ? 0.45 : i / (group.length - 1);
      const radius = R_MIN + t * (R_MAX - R_MIN);

      // Within the sector, fan out evenly — and inset from both edges by half a
      // step so two adjacent kinds never touch.
      const spread = group.length === 1 ? 0.5 : (i + 0.5) / group.length;
      const angle = angleCursor + span * spread;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const x = CENTRE + cos * radius;
      const y = CENTRE + sin * radius;
      // Node size is the square root of the count, so *area* tracks the count.
      // On a linear radius the largest name would be a hundred times the area
      // of the smallest and would be the only thing on the picture.
      const r = 5 + Math.sqrt(node.count) * 1.35;

      placed.push({
        ...node,
        x,
        y,
        r,
        labelX: x + cos * (r + 10),
        labelY: y + sin * (r + 10),
        cos,
        sin,
      });
    });

    const mid = angleCursor + span / 2;
    sectors.push({
      kind,
      from: angleCursor,
      to: angleCursor + span,
      // The name reads outward from the dial, so it never sits on top of a node.
      labelX: CENTRE + Math.cos(mid) * R_LABEL,
      labelY: CENTRE + Math.sin(mid) * R_LABEL,
      cos: Math.cos(mid),
      sin: Math.sin(mid),
      count: group.length,
    });

    angleCursor += span;
  }

  return { placed, sectors };
}

/* ── Which names are printed on the dial ──────────────────────────────────────
   The substantial nodes carry their name in place, and the heaviest names all
   sit nearest the hub — so in the music sector they landed on one another. At
   1280px, 60 pairs among the 21 printed names overlapped, and the top of the
   music arc was one illegible smear. So names are taken heaviest first, and a
   name that would land on one already placed is left off the picture. It is one
   focus away, and always in the readout and the index beside the dial.

   The test runs at the narrowest the dial is ever drawn: xl, with the rail
   expanded, 592px across. Names are CSS pixels on a dial that scales, so two
   that clear each other at 592px clear each other at every larger size. */
const NARROWEST_DIAL_PX = 592;
const PX_PER_UNIT = NARROWEST_DIAL_PX / BOX_W;
/** Azeret Mono at 12px bold, measured off the rendered names: 7.8px a character
 *  (it is monospaced), 12px tall at leading-none. */
const NAME_CHAR_PX = 7.8;
const NAME_H_PX = 12;
/** The sector names are .k-label: 11px tracked caps, measured at 8.69px a
 *  character including the tracking, 14.3px tall. */
const SECTOR_CHAR_PX = 8.69;
const SECTOR_H_PX = 14.3;
/** Clear space kept round every printed name. */
const NAME_GAP_PX = 3;

interface Box {
  l: number;
  t: number;
  r: number;
  b: number;
}

/** The box a label of the given pixel size occupies, in viewBox units, anchored
 *  at (x, y) exactly as radialShift(cos, sin) places it. */
function boxAt(x: number, y: number, cos: number, sin: number, wPx: number, hPx: number): Box {
  const w = wPx / PX_PER_UNIT;
  const h = hPx / PX_PER_UNIT;
  const g = NAME_GAP_PX / PX_PER_UNIT;
  const side = cos > 0.3 || cos < -0.3;
  const l = cos > 0.3 ? x : cos < -0.3 ? x - w : x - w / 2;
  const t = side ? y - h / 2 : sin < 0 ? y - h : y;
  return { l: l - g, t: t - g, r: l + w + g, b: t + h + g };
}

function overlaps(a: Box, b: Box): boolean {
  return a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
}

function sectorBox(s: Sector): Box {
  const text = `${kindDef(s.kind).plural} ${s.count}`;
  return boxAt(s.labelX, s.labelY, s.cos, s.sin, text.length * SECTOR_CHAR_PX, SECTOR_H_PX);
}

/** Where a node's name is printed. Outward from the hub, so names fan apart by
 *  angle — except where that would land it on its sector's name, which happens
 *  out at the rim. The sector names never move or dim (they are the map's
 *  coordinates), so the node's name goes on the inward side instead. */
interface NamePlace {
  x: number;
  y: number;
  cos: number;
  sin: number;
  box: Box;
}

function namePlace(n: Placed, sectorBoxes: Box[]): NamePlace {
  const wPx = clip(n.label, 16).length * NAME_CHAR_PX;
  const out = boxAt(n.labelX, n.labelY, n.cos, n.sin, wPx, NAME_H_PX);
  if (!sectorBoxes.some((b) => overlaps(out, b))) return { x: n.labelX, y: n.labelY, cos: n.cos, sin: n.sin, box: out };
  const x = n.x - n.cos * (n.r + 10);
  const y = n.y - n.sin * (n.r + 10);
  return { x, y, cos: -n.cos, sin: -n.sin, box: boxAt(x, y, -n.cos, -n.sin, wPx, NAME_H_PX) };
}

/** The names printed without a focus: substantial nodes, heaviest first, each
 *  only if it has room — clear of the sector names and of every name already
 *  placed. Deterministic, like the layout it reads. */
function namedInPlace(placed: Placed[], places: Map<string, NamePlace>, sectorBoxes: Box[]): Set<string> {
  const taken: Box[] = [...sectorBoxes];
  const named = new Set<string>();
  const candidates = placed
    .filter((n) => n.r > 20)
    .sort((a, b) => b.count - a.count || (a.name < b.name ? -1 : 1));
  for (const n of candidates) {
    const box = places.get(n.name)?.box;
    if (!box || taken.some((t) => overlaps(box, t))) continue;
    taken.push(box);
    named.add(n.name);
  }
  return named;
}

function EntityPanel({
  node,
  onClose,
}: {
  node: EntityNode;
  onClose: () => void;
}): React.JSX.Element {
  const { openReceipt } = useOverlay();
  const neighbours = coOccurrences(node.name, ENTITY_GRAPH, 8);

  const receipts = useMemo(
    () =>
      node.receiptIds
        .map((id) => receiptById(id))
        .filter((r): r is Receipt => Boolean(r))
        .sort((a, b) => (a.at < b.at ? 1 : -1))
        .slice(0, 12),
    [node.receiptIds],
  );

  const kinds = KIND_ORDER.map((k) => ({ kind: k, count: node.byKind[k] ?? 0 })).filter(
    (k) => k.count > 0,
  );

  return (
    <div className="k-paper k-panel-flat p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Slug>{kindDef(node.kind).plural}</Slug>
          <h3 className="k-display-sm mt-2 break-words">{node.label}</h3>
        </div>
        <button type="button" onClick={onClose} className="k-btn k-btn-outline flex-none px-3 py-2">
          Clear
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-baseline gap-x-5 gap-y-2">
        <span className="inline-flex items-baseline gap-2">
          <span className="k-figure nx-numeric text-[22px]">{num(node.count)}</span>
          <span className="k-label">receipts</span>
        </span>
        <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
          {dateLabel(node.firstAt, '')} → {dateLabel(node.lastAt, '')}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        {kinds.map(({ kind, count }) => (
          <span key={kind} className="inline-flex items-center gap-1.5">
            <KindIcon kind={kind} size={11} />
            <span className="k-label" style={{ color: 'var(--text-tertiary)' }}>
              {num(count)}
            </span>
          </span>
        ))}
      </div>

      <hr className="k-rule-thin my-5" />

      <Slug>Turns up alongside</Slug>
      {neighbours.length > 0 ? (
        <div className="mt-2.5 space-y-2">
          {neighbours.map((n) => {
            const other = ENTITY_GRAPH.nodes.find((x) => x.name === n.name);
            return (
              <div key={n.name} className="flex items-baseline justify-between gap-3">
                <span
                  className="min-w-0 flex-1 truncate text-[13px]"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {other?.label ?? n.name}
                </span>
                <span className="k-figure nx-numeric flex-none text-[11px]">
                  {plural(n.weight, 'receipt')}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="nx-support mt-2">
          Nothing else recurs with this often enough to count as a relationship.
        </p>
      )}

      <hr className="k-rule-thin my-5" />

      <Slug>Most recent receipts</Slug>
      <div className="mt-2.5 space-y-2">
        {receipts.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => openReceipt(r.id)}
            className="k-receipt flex w-full cursor-pointer items-start gap-2.5 p-2.5 text-left"
          >
            <KindIcon kind={r.kind} size={11} />
            <span className="min-w-0 flex-1">
              <span
                className="block break-words"
                style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 12 }}
              >
                {clip(r.title, 60)}
              </span>
              <span className="block text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                {dateLabel(r.at, 'date unrecorded')}
              </span>
            </span>
          </button>
        ))}
      </div>

      {node.count > receipts.length && (
        <p className="nx-support mt-3">
          {num(node.count - receipts.length)} older receipts carry this name too.
        </p>
      )}
    </div>
  );
}

export default function ConstellationPage(): React.JSX.Element {
  const [pinned, setPinned] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<ReceiptKind | null>(null);

  // ── The layout is computed once, from the whole graph, and never from a
  //    filtered subset ────────────────────────────────────────────────────────
  // Re-laying out on every filter click would be deterministic but useless: the
  // entire dial would rearrange, every name would move, and the reader would lose
  // the one thing this layout buys them — that a name is always in the same
  // place. So the filter dims, exactly like the hover does. The picture is a
  // fixed map and the controls change what is lit on it.
  const { placed: nodes, sectors } = useMemo(() => layout(ENTITY_GRAPH.nodes), []);

  const positions = useMemo(() => new Map(nodes.map((n) => [n.name, n])), [nodes]);
  const sectorBoxes = useMemo(() => sectors.map(sectorBox), [sectors]);
  const places = useMemo(() => new Map(nodes.map((n) => [n.name, namePlace(n, sectorBoxes)])), [nodes, sectorBoxes]);
  const inPlace = useMemo(() => namedInPlace(nodes, places, sectorBoxes), [nodes, places, sectorBoxes]);
  const kindOf = useMemo(
    () => new Map(ENTITY_GRAPH.nodes.map((n) => [n.name, n.kind])),
    [],
  );

  const edges = useMemo(
    () => ENTITY_GRAPH.edges.filter((e) => positions.has(e.a) && positions.has(e.b)),
    [positions],
  );

  // Names the kind filter keeps: the kind itself, plus whatever shares a receipt
  // with it. The neighbours are the point — a filter that showed only purchases
  // would hide every relationship the purchases are in, which is the one thing
  // this page is for.
  const selected = useMemo(() => {
    if (!kindFilter) return null;
    const set = new Set<string>();
    for (const n of ENTITY_GRAPH.nodes) if (n.kind === kindFilter) set.add(n.name);
    for (const e of ENTITY_GRAPH.edges) {
      if (kindOf.get(e.a) === kindFilter) set.add(e.b);
      if (kindOf.get(e.b) === kindFilter) set.add(e.a);
    }
    return set;
  }, [kindFilter, kindOf]);

  const focus = pinned ?? hovered;
  // A focused name is always printed, so any printed name it would land on
  // steps aside while it is.
  const focusBox = focus ? (places.get(focus)?.box ?? null) : null;
  /** A printed name that the focused name would land on, which yields while the
   *  focus holds. */
  const yields = (name: string): boolean => {
    const box = places.get(name)?.box;
    return Boolean(focusBox && box && overlaps(box, focusBox));
  };

  // Everything within one hop of the focused entity. `null` means nothing is
  // focused, which is how the dim is switched off.
  const lit = useMemo(() => {
    if (!focus) return null;
    const set = new Set<string>([focus]);
    for (const e of ENTITY_GRAPH.index.get(focus) ?? []) {
      set.add(e.a === focus ? e.b : e.a);
    }
    return set;
  }, [focus]);

  /** A name is drawn at full ink only if it survives both the filter and the
   *  focus. The two compose rather than override each other. */
  const isOn = (name: string): boolean =>
    (!selected || selected.has(name)) && (!lit || lit.has(name));
  const dimmed = Boolean(selected) || Boolean(lit);

  const pinnedNode = pinned ? ENTITY_GRAPH.nodes.find((n) => n.name === pinned) : undefined;

  const kindCounts = useMemo(() => {
    const counts = new Map<ReceiptKind, number>();
    for (const n of ENTITY_GRAPH.nodes) counts.set(n.kind, (counts.get(n.kind) ?? 0) + 1);
    return counts;
  }, []);

  const ranked = useMemo(
    () =>
      ENTITY_GRAPH.nodes
        .filter((n) => !selected || selected.has(n.name))
        .sort((a, b) => b.count - a.count || (a.name < b.name ? -1 : 1)),
    [selected],
  );

  /** The dial flattened: kinds in display order, ranked within each. */
  const grouped = useMemo(
    () =>
      KIND_ORDER.map((kind) => ({
        kind,
        members: ranked.filter((n) => n.kind === kind),
      })).filter((g) => g.members.length > 0),
    [ranked],
  );

  return (
    <div className="space-y-6">
      <section className="k-paper k-panel p-5 sm:p-6">
        <Slug>How to read it</Slug>
        <h2 className="k-display-sm mt-2">THE NAMES THAT KEEP COMING BACK</h2>
        <p className="nx-support mt-3 max-w-[72ch]">
          {num(ENTITY_GRAPH.nodes.length)} names — artists, merchants, categories,
          places, payment modes — joined wherever two of them turn up on the same
          receipt. Position is not decorative: each kind owns a wedge of the dial,
          and inside its wedge a name sits closer to the centre the more of the
          archive it accounts for. Nothing here moves on its own, and the picture is
          the same every time you open it.
        </p>

        <hr className="k-rule-thin my-5" />

        <Slug>Show what touches</Slug>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {KIND_ORDER.filter((k) => (kindCounts.get(k) ?? 0) > 0).map((k) => (
            <Chip
              key={k}
              label={kindDef(k).plural}
              count={kindCounts.get(k)}
              active={kindFilter === k}
              onClick={() => setKindFilter((cur) => (cur === k ? null : k))}
            />
          ))}
          {kindFilter && (
            <Chip label="Everything" active={false} onClick={() => setKindFilter(null)} />
          )}
        </div>
      </section>

      <div className="flex flex-col gap-6 xl:flex-row">
        {/* ── The graph, from xl up ──────────────────────────────────────── */}
        {/* An SVG network is genuinely unusable at 360px — the nodes would be two
            pixels apart and there is no hover. Below xl the same data is a ranked
            list with the same click-through and the same panel. Same information,
            appropriate form; not a pinch-zoom canvas and not an apology asking the
            reader to come back on a desktop.

            `xl` rather than `lg` because of the type, not the graphics. Beside a
            340px index and inside the shell's rail, this column is only 344px at
            lg — and the rim labels are set in CSS pixels, so at that width they
            would take more room than the dial they annotate. At xl the column is
            about 600px and at the shell's widest about 820px, which is what the
            gutters in BOX are sized against. */}
        <div className="hidden min-w-0 flex-1 xl:block">
          <div className="k-paper k-panel-flat p-4">
            {/* `relative`, because the type layer below is positioned against
                this box and nothing else. */}
            <div className="relative">
              <svg
                viewBox={BOX}
                className="block h-auto w-full"
                role="img"
                aria-label={`A network of ${ENTITY_GRAPH.nodes.length} recurring names in the archive`}
              >
                {/* ── The dial itself ────────────────────────────────────────
                    Drawn before anything else, because it is the frame the data
                    sits in rather than part of the data. The names that go with
                    these wedges are in the type layer below. */}
                <g aria-hidden="true">
                  {sectors.map((s) => (
                    <line
                      key={s.kind}
                      x1={CENTRE}
                      y1={CENTRE}
                      x2={CENTRE + Math.cos(s.from) * (R_MAX + 18)}
                      y2={CENTRE + Math.sin(s.from) * (R_MAX + 18)}
                      stroke="var(--k-edge)"
                      strokeWidth={1}
                    />
                  ))}
                </g>

                {/* Edges next, so nodes sit on top of them. */}
                <g>
                  {edges.map((e) => {
                    const a = positions.get(e.a)!;
                    const b = positions.get(e.b)!;
                    // A line survives only if both its ends do. Half-lit edges
                    // would draw relationships to names that are not on show.
                    const on = isOn(e.a) && isOn(e.b);
                    return (
                      <line
                        key={`${e.a}|${e.b}`}
                        x1={a.x}
                        y1={a.y}
                        x2={b.x}
                        y2={b.y}
                        stroke="var(--k-edge-strong)"
                        // Weight reads as thickness, not as colour — the ramp is
                        // spent on kind and cannot also carry strength.
                        strokeWidth={Math.min(3.5, 0.5 + e.weight / 45)}
                        // At rest the whole mesh is deliberately faint: it is
                        // texture until something is selected, and then it is the
                        // answer.
                        opacity={on ? (dimmed ? 0.85 : 0.3) : 0.05}
                      />
                    );
                  })}
                </g>

                <g>
                  {nodes.map((n) => {
                    const on = isOn(n.name);
                    const isFocus = focus === n.name;
                    return (
                      <g
                        key={n.name}
                        onMouseEnter={() => setHovered(n.name)}
                        onMouseLeave={() => setHovered(null)}
                        onFocus={() => setHovered(n.name)}
                        onBlur={() => setHovered(null)}
                        onClick={() => setPinned((cur) => (cur === n.name ? null : n.name))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setPinned((cur) => (cur === n.name ? null : n.name));
                          }
                        }}
                        tabIndex={0}
                        role="button"
                        aria-pressed={pinned === n.name}
                        aria-label={`${n.label}, ${plural(n.count, 'receipt')}, mostly ${kindDef(n.kind).plural.toLowerCase()}`}
                        style={{ cursor: 'pointer', opacity: on ? 1 : 0.12 }}
                      >
                        {/* A circle is one of the four shapes the language keeps
                            round — a dot, like a ring or an avatar. */}
                        <circle
                          cx={n.x}
                          cy={n.y}
                          r={n.r}
                          fill={kindDef(n.kind).color}
                          stroke={isFocus ? 'var(--text-primary)' : 'var(--k-edge-strong)'}
                          strokeWidth={isFocus ? 4 : 1.5}
                        />
                      </g>
                    );
                  })}
                </g>
              </svg>

              {/* ── The type layer ────────────────────────────────────────────
                  Every name on the dial, set in CSS pixels over the geometry.
                  See the note on BOX for why this is not <text>.

                  `aria-hidden`, because it is a second rendering of names the
                  SVG already exposes: the graph carries one aria-label and each
                  node is a labelled button. Reading them twice would be worse
                  than not reading them here at all. */}
              <div className="pointer-events-none absolute inset-0" aria-hidden="true">
                {/* The sector names are load-bearing, not labelling for its own
                    sake: three of the nine kinds deliberately share the neutral
                    grey (see src/lib/kinds.ts — colour encodes provenance there,
                    and a tenth hue to break the tie would cost more than it
                    buys). Printing the kind on the rim means the reader never has
                    to resolve two grey swatches in a legend — the wedge says what
                    it holds.

                    The frame never dims. Filtering and hovering change what is lit
                    *on* the map; if the map's own coordinate labels faded too, the
                    reader would lose their bearings at the exact moment they are
                    looking for something. */}
                {sectors.map((s) => (
                  <span
                    key={s.kind}
                    className="k-label absolute whitespace-nowrap"
                    style={{
                      ...pos(s.labelX, s.labelY),
                      transform: radialShift(s.cos, s.sin),
                      color: 'var(--text-tertiary)',
                    }}
                  >
                    {kindDef(s.kind).plural} {s.count}
                  </span>
                ))}

                {/* Only the substantial nodes are named in place, only where the
                    name has room (namedInPlace), and the name is thrown outward
                    from the hub so the labels fan apart by angle. 131 names at
                    once is not a picture, and the rest are one hover away in the
                    readout and always present in the index beside. */}
                {nodes
                  .filter(
                    (n) =>
                      (focus === n.name ||
                        (inPlace.has(n.name) && !yields(n.name))) &&
                      isOn(n.name),
                  )
                  .map((n) => {
                    const at = places.get(n.name) ?? { x: n.labelX, y: n.labelY, cos: n.cos, sin: n.sin };
                    return (
                      <span
                        key={n.name}
                        className="absolute whitespace-nowrap text-[12px] leading-none"
                        style={{
                          ...pos(at.x, at.y),
                          transform: radialShift(at.cos, at.sin),
                          fontFamily: 'var(--font-display)',
                          fontWeight: 700,
                          color: 'var(--text-primary)',
                        }}
                      >
                        {/* 16, not the 22 the readout allows: a focused node can
                            be out at the rim, where a longer name would run past
                            the panel edge. The full name is in the readout below
                            and in the index beside, both at reading size. */}
                        {clip(n.label, 16)}
                      </span>
                    );
                  })}
              </div>
            </div>

            {/* Readout and legend. */}
            <div
              className="mt-4 flex min-h-[46px] flex-wrap items-baseline gap-x-4 gap-y-1 pt-3"
              style={{ borderTop: '2px solid var(--k-edge)' }}
              aria-live="polite"
            >
              {focus ? (
                (() => {
                  const n = ENTITY_GRAPH.nodes.find((x) => x.name === focus);
                  if (!n) return null;
                  return (
                    <>
                      <span className="k-figure nx-numeric text-[15px]">{n.label}</span>
                      <span className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
                        {plural(n.count, 'receipt')} ·{' '}
                        {plural(ENTITY_GRAPH.index.get(n.name)?.length ?? 0, 'connection')} ·{' '}
                        {dateLabel(n.firstAt, '')} → {dateLabel(n.lastAt, '')}
                      </span>
                      {!pinned && (
                        <span className="k-label" style={{ color: 'var(--text-tertiary)' }}>
                          Select to pin and read its receipts
                        </span>
                      )}
                    </>
                  );
                })()
              ) : (
                <span className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
                  Hover a name to isolate what it shares receipts with. Select one to pin it and
                  open its receipts.
                </span>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
              {KIND_ORDER.filter((k) => (kindCounts.get(k) ?? 0) > 0).map((k) => (
                <span key={k} className="inline-flex items-center gap-1.5">
                  <span
                    className="h-[11px] w-[11px] flex-none rounded-full"
                    style={{ background: kindDef(k).color, border: '1px solid var(--k-edge-strong)' }}
                    aria-hidden="true"
                  />
                  <span className="k-label" style={{ color: 'var(--text-tertiary)' }}>
                    {kindDef(k).plural}
                  </span>
                </span>
              ))}
            </div>
            <p className="nx-support mt-3">
              Dot area is how many receipts carry the name. Line thickness is how many receipts two
              names share. Angle is the kind — named on the rim — and distance from the centre is
              rank within that kind. Grey marks a kind the engine reconstructed rather than read
              from a file, which is why more than one of them is grey.
            </p>
          </div>
        </div>

        {/* ── The same graph, as a list ─────────────────────────────────────
            Grouped by kind and ranked inside each group, which is exactly what
            the dial is: sector, then radius. So this is not a reduced fallback —
            it is the same two facts in the form that works at 360px, with the
            same click-through into the same panel. On a phone it is the whole
            page; above `xl` it sits beside the dial and doubles as its index —
            which is also where the names of the nodes too small to label in
            place are always readable. */}
        <aside className="min-w-0 xl:w-[340px] xl:flex-none">
          {pinnedNode ? (
            <EntityPanel node={pinnedNode} onClose={() => setPinned(null)} />
          ) : (
            <div className="k-paper k-panel-flat p-5">
              <Slug>{kindFilter ? `${kindDef(kindFilter).plural} and what they touch` : 'Every name on the graph'}</Slug>
              <p className="nx-support mt-2">
                {num(ranked.length)} names, grouped by kind and ranked by how many
                receipts carry them. Select one to read what it connects to and open
                its receipts.
              </p>

              <div className="mt-4 space-y-5">
                {grouped.map((group) => (
                  <div key={group.kind}>
                    <div
                      className="flex items-center gap-2 pb-1.5"
                      style={{ borderBottom: '2px solid var(--k-edge)' }}
                    >
                      <KindIcon kind={group.kind} size={11} />
                      <span className="k-label" style={{ color: 'var(--text-secondary)' }}>
                        {kindDef(group.kind).plural}
                      </span>
                      <span
                        className="k-figure nx-numeric ml-auto text-[11px]"
                        style={{ color: 'var(--text-tertiary)' }}
                      >
                        {num(group.members.length)}
                      </span>
                    </div>
                    <div className="mt-1.5 space-y-0.5">
                      {group.members.map((n) => (
                        <button
                          key={n.name}
                          type="button"
                          onClick={() => setPinned(n.name)}
                          onMouseEnter={() => setHovered(n.name)}
                          onMouseLeave={() => setHovered(null)}
                          onFocus={() => setHovered(n.name)}
                          onBlur={() => setHovered(null)}
                          className="flex w-full cursor-pointer items-center gap-2.5 px-2 py-1.5 text-left"
                          style={{
                            background:
                              hovered === n.name ? 'var(--frame-hover)' : 'var(--frame-hover-off)',
                          }}
                        >
                          <span
                            className="min-w-0 flex-1 truncate text-[13px]"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            {n.label}
                          </span>
                          <span
                            className="k-label flex-none"
                            style={{ color: 'var(--text-tertiary)' }}
                          >
                            {num(ENTITY_GRAPH.index.get(n.name)?.length ?? 0)} links
                          </span>
                          <span
                            className="k-figure nx-numeric flex-none text-[11px]"
                            style={{ minWidth: '4ch', textAlign: 'right' }}
                          >
                            {num(n.count)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6">
                <Link href="/threads" className="k-btn k-btn-outline w-full">
                  See these names as moments
                  <ArrowRight size={13} />
                </Link>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
