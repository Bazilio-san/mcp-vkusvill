/**
 * In-memory reference of VkusVill shop filters (region / city / subway / feature) plus a fuzzy
 * resolver that turns a free-text query (region name, city name, metro station) into the numeric
 * filter id the upstream `vkusvill_shops` tool expects.
 *
 * The reference is fetched once from the upstream by calling `vkusvill_shops` with empty arguments —
 * the response carries the full filter dictionary in `meta.filters`. Results are cached in memory
 * with a TTL and refreshed lazily; {@link primeShopsReference} can warm the cache at startup.
 */

import chalk from 'chalk';

import { logger as lgr } from 'fa-mcp-sdk';

import { phraseSimilarity } from './string-similarity.js';
import { transliterate, transliterateRU } from './transliterate.js';
import { getVkusvillClient } from './vkusvill-client.js';

const logger = lgr.getSubLogger({ name: chalk.bgGrey('shops-reference') });

/** A single filter option from the upstream dictionary. `line` is present only for subway stations. */
export interface IFilterItem {
  id: number;
  name: string;
  line?: string;
}

export interface IShopsReference {
  region: IFilterItem[];
  city: IFilterItem[];
  subway: IFilterItem[];
  feature: IFilterItem[];
}

const REFERENCE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

let cache: IShopsReference | null = null;
let cachedAt = 0;
let inFlight: Promise<IShopsReference> | null = null;

const EMPTY_REFERENCE: IShopsReference = { region: [], city: [], subway: [], feature: [] };

/** Parse the upstream `meta.filters` array into the typed reference grouped by filter param. */
const parseReference = (data: any): IShopsReference => {
  const filters: any[] = Array.isArray(data?.meta?.filters) ? data.meta.filters : [];
  const byParam = (param: string): IFilterItem[] => {
    const block = filters.find((f) => f?.param === param);
    const items: any[] = Array.isArray(block?.items) ? block.items : [];
    return items
      .filter((it) => it && typeof it.id === 'number' && typeof it.name === 'string')
      .map((it) => ({ id: it.id, name: it.name, ...(it.line ? { line: it.line } : {}) }));
  };
  return {
    region: byParam('region'),
    city: byParam('city'),
    subway: byParam('subway'),
    feature: byParam('feature'),
  };
};

/** Get the shop filter reference, fetching it from the upstream on first use or after the TTL. */
export const getShopsReference = async (signal?: AbortSignal): Promise<IShopsReference> => {
  if (cache && Date.now() - cachedAt < REFERENCE_TTL_MS) {
    return cache;
  }
  if (inFlight) {
    return inFlight;
  }
  inFlight = (async () => {
    try {
      const data = await getVkusvillClient().callTool('vkusvill_shops', {}, signal);
      const ref = parseReference(data);
      cache = ref;
      cachedAt = Date.now();
      logger.debug(
        `Loaded shop filters: ${ref.region.length} regions, ${ref.city.length} cities, ` +
          `${ref.subway.length} subway stations, ${ref.feature.length} features`,
      );
      return ref;
    } catch (error) {
      logger.warn(`Failed to load shop filter reference: ${(error as Error).message}`);
      // Serve a stale cache if we have one, otherwise an empty reference (fuzzy search returns nothing).
      return cache ?? EMPTY_REFERENCE;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
};

/** Warm the reference cache at startup (fire-and-forget — failures are logged, not thrown). */
export const primeShopsReference = (): void => {
  getShopsReference().catch(() => {
    /* already logged inside getShopsReference */
  });
};

// ---- Fuzzy resolver ----

const FUZZY_THRESHOLD = 0.5;
const MIN_QUERY_LEN_FOR_FUZZY = 3;
const CLEAR_WINNER_GAP = 0.15;
const MAX_CANDIDATES = 8;

type TMatchKind = 'exact' | 'prefix' | 'substring' | 'fuzzy';

interface IScored {
  item: IFilterItem;
  score: number;
  kind: TMatchKind;
}

export type TResolveOutcome =
  | { status: 'resolved'; item: IFilterItem }
  | { status: 'ambiguous'; candidates: IFilterItem[] }
  | { status: 'none' };

/** Unique lowercase comparison variants of a string across both scripts. */
const variantsOf = (s: string): string[] => {
  const lower = s.toLowerCase();
  return Array.from(new Set([lower, transliterate(lower), transliterateRU(lower)]));
};

/** Score one reference item against the query, comparing across Latin/Cyrillic variants. */
const scoreItem = (item: IFilterItem, queryVariants: string[]): IScored | null => {
  const nameVariants = variantsOf(item.name);

  for (const nv of nameVariants) {
    for (const qv of queryVariants) {
      if (nv === qv) {
        return { item, score: 1, kind: 'exact' };
      }
    }
  }

  let best = 0;
  let kind: TMatchKind | null = null;
  const allowFuzzy = queryVariants.some((qv) => qv.length >= MIN_QUERY_LEN_FOR_FUZZY);

  for (const nv of nameVariants) {
    for (const qv of queryVariants) {
      if (!qv) {
        continue;
      }
      if (nv.startsWith(qv) && 0.9 > best) {
        best = 0.9;
        kind = 'prefix';
      } else if (nv.includes(qv) && 0.7 > best) {
        best = 0.7;
        kind = 'substring';
      }
      if (allowFuzzy) {
        const sim = phraseSimilarity(nv, qv);
        if (sim > best && sim >= FUZZY_THRESHOLD) {
          best = sim;
          kind = 'fuzzy';
        }
      }
    }
  }

  return kind ? { item, score: best, kind } : null;
};

/**
 * Resolve a free-text query to a single reference item. Returns `resolved` for a clear single
 * winner, `ambiguous` with a short candidate list when several options are close, and `none` when
 * nothing matches.
 */
export const resolveFilter = (items: IFilterItem[], query: string): TResolveOutcome => {
  const q = (query ?? '').trim();
  if (!q) {
    return { status: 'none' };
  }
  const queryVariants = variantsOf(q);

  const scored: IScored[] = [];
  for (const item of items) {
    const s = scoreItem(item, queryVariants);
    if (s) {
      scored.push(s);
    }
  }
  if (!scored.length) {
    return { status: 'none' };
  }

  scored.sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name));

  const exacts = scored.filter((s) => s.kind === 'exact');
  if (exacts.length === 1) {
    return { status: 'resolved', item: exacts[0]!.item };
  }
  if (exacts.length > 1) {
    return { status: 'ambiguous', candidates: exacts.slice(0, MAX_CANDIDATES).map((s) => s.item) };
  }

  const top = scored[0]!;
  const second = scored[1];
  const clearWinner = !second || top.score - second.score >= CLEAR_WINNER_GAP;
  if (clearWinner && top.score >= 0.6) {
    return { status: 'resolved', item: top.item };
  }

  const cutoff = top.score - CLEAR_WINNER_GAP;
  const candidates = scored
    .filter((s) => s.score >= cutoff)
    .slice(0, MAX_CANDIDATES)
    .map((s) => s.item);
  return { status: 'ambiguous', candidates };
};

/** Human-readable label for a filter item (adds the metro line in parentheses when present). */
export const filterItemLabel = (item: IFilterItem): string =>
  item.line ? `${item.name} (линия ${item.line})` : item.name;
