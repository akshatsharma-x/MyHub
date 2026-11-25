import type { Receipt, ReceiptKind } from '@/lib/types';
import { text } from '@/lib/format';
import { titleCase } from './links';

/**
 * The archive as a network of *names* rather than of receipts.
 *
 * ── Why the nodes are entities ────────────────────────────────────────────────
 * A graph of 2,411 receipts joined by 8,181 links is a hairball: every node is a
 * single moment, so nothing recurs, and the picture says only "there are a lot of
 * these". A graph of entities says something a reader can act on — The Beatles sit
 * next to Radiohead because they share evenings; Travel sits next to a set of
 * cities; a film composer sits between the music and the screen spend. The nodes
 * are the things that *repeat*, which is the only reason a network is the right
 * shape for this data at all.
 *
 * Edges are co-occurrence on the same receipt. Two names that keep appearing on
 * the same slip are related in the only sense this archive can evidence.
 */

export interface EntityNode {
  name: string;
  /** Printable. The stored entity tokens are lowercased join keys. */
  label: string;
  count: number;
  /** The kind that most of this entity's receipts are. Drives colour. */
  kind: ReceiptKind;
  /** Per-kind breakdown, so the side panel can say more than the dominant kind. */
  byKind: Partial<Record<ReceiptKind, number>>;
  firstAt: string;
  lastAt: string;
  receiptIds: string[];
}

export interface EntityEdge {
  a: string;
  b: string;
  /** Receipts both names appear on. */
  weight: number;
}

export interface EntityGraph {
  nodes: EntityNode[];
  edges: EntityEdge[];
  /** Adjacency, strongest first, for the hover dim and the side panel. */
  index: Map<string, EntityEdge[]>;
}

/** Entities on fewer receipts than this never recur enough to be worth a node. */
const MIN_COUNT = 3;
/** Names sharing fewer receipts than this are a coincidence, not a relationship. */
const MIN_EDGE = 2;
/** A receipt with a very long entity list would contribute a dense clique that
 *  swamps every real edge, so its co-occurrences are skipped. The receipts stay —
 *  only their contribution to the edge set is capped. */
const MAX_CLIQUE = 14;

export function buildEntityGraph(receipts: Receipt[], limit = 150): EntityGraph {
  const nodes = new Map<string, EntityNode>();

  for (const r of receipts) {
    for (const raw of r.entities ?? []) {
      const name = text(raw);
      if (!name) continue;
      let node = nodes.get(name);
      if (!node) {
        node = {
          name,
          label: titleCase(name) ?? name,
          count: 0,
          kind: r.kind,
          byKind: {},
          firstAt: r.at,
          lastAt: r.at,
          receiptIds: [],
        };
        nodes.set(name, node);
      }
      node.count += 1;
      node.byKind[r.kind] = (node.byKind[r.kind] ?? 0) + 1;
      if (r.at < node.firstAt) node.firstAt = r.at;
      if (r.at > node.lastAt) node.lastAt = r.at;
      node.receiptIds.push(r.id);
    }
  }

  // The dominant kind, resolved with a name tiebreak so a 50/50 split does not
  // flip colour between builds.
  for (const node of nodes.values()) {
    let best: ReceiptKind = node.kind;
    let bestN = -1;
    for (const [kind, n] of Object.entries(node.byKind) as Array<[ReceiptKind, number]>) {
      if (n > bestN || (n === bestN && kind < best)) {
        best = kind;
        bestN = n;
      }
    }
    node.kind = best;
  }

  const ranked = [...nodes.values()]
    .filter((n) => n.count >= MIN_COUNT)
    .sort((a, b) => b.count - a.count || (a.name < b.name ? -1 : 1));

  // ── Why the budget is shared across kinds rather than spent on rank ────────
  // Taking the top 150 by count outright gives 124 artists, 7 places and 2 screen
  // entities, because every listening session carries a handful of artist names
  // and a purchase carries one merchant. That graph is technically the biggest
  // names in the archive and it is useless for this route's actual question,
  // which is what connects *across* the ledgers: colour stops meaning anything
  // when six sevenths of the nodes are the same colour, and the cities, merchants
  // and categories that bridge music to money get squeezed out by the long tail
  // of bands.
  //
  // So the kinds take turns. Each round takes the next-highest-ranked unplaced
  // entity of every kind, which keeps rank as the ordering *within* a kind while
  // guaranteeing the smaller kinds are on the picture at all.
  const queues = new Map<ReceiptKind, EntityNode[]>();
  for (const n of ranked) {
    const q = queues.get(n.kind);
    if (q) q.push(n);
    else queues.set(n.kind, [n]);
  }
  // Sorted by name so the round-robin order does not depend on Map insertion,
  // which depends on receipt order, which would make the layout drift on rebuild.
  const kinds = [...queues.keys()].sort();
  const cursors = new Map<ReceiptKind, number>(kinds.map((k) => [k, 0]));

  const kept: EntityNode[] = [];
  let progress = true;
  while (kept.length < limit && progress) {
    progress = false;
    for (const kind of kinds) {
      if (kept.length >= limit) break;
      const q = queues.get(kind)!;
      const i = cursors.get(kind)!;
      if (i >= q.length) continue;
      kept.push(q[i]);
      cursors.set(kind, i + 1);
      progress = true;
    }
  }
  kept.sort((a, b) => b.count - a.count || (a.name < b.name ? -1 : 1));

  const keptNames = new Set(kept.map((n) => n.name));

  // Co-occurrence, counted over the kept names only.
  const pairs = new Map<string, number>();
  for (const r of receipts) {
    const names = (r.entities ?? []).filter((e) => keptNames.has(e)).sort();
    if (names.length < 2 || names.length > MAX_CLIQUE) continue;
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const key = `${names[i]}\u0000${names[j]}`;
        pairs.set(key, (pairs.get(key) ?? 0) + 1);
      }
    }
  }

  const edges: EntityEdge[] = [];
  for (const [key, weight] of pairs) {
    if (weight < MIN_EDGE) continue;
    const [a, b] = key.split('\u0000');
    edges.push({ a, b, weight });
  }
  edges.sort((x, y) => y.weight - x.weight || (x.a < y.a ? -1 : x.a > y.a ? 1 : x.b < y.b ? -1 : 1));

  const index = new Map<string, EntityEdge[]>();
  const push = (name: string, edge: EntityEdge) => {
    const list = index.get(name);
    if (list) list.push(edge);
    else index.set(name, [edge]);
  };
  for (const e of edges) {
    push(e.a, e);
    push(e.b, e);
  }
  for (const list of index.values()) list.sort((x, y) => y.weight - x.weight);

  // An entity that shares no receipt with any other kept entity carries no
  // relationship, and a relationship graph is the wrong place to draw it — it
  // renders as a dot floating in the margin that dims when anything is hovered
  // and explains nothing. It keeps its receipts and is still findable on the roll;
  // it is only absent from this one view.
  const connected = kept.filter((n) => (index.get(n.name)?.length ?? 0) > 0);

  return { nodes: connected, edges, index };
}

/** The other end of each of an entity's edges, strongest first. */
export function coOccurrences(
  name: string,
  graph: EntityGraph,
  limit = 8,
): Array<{ name: string; weight: number }> {
  const out: Array<{ name: string; weight: number }> = [];
  for (const e of graph.index.get(name) ?? []) {
    out.push({ name: e.a === name ? e.b : e.a, weight: e.weight });
    if (out.length >= limit) break;
  }
  return out;
}
