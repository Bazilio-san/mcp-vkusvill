/**
 * Similarity metric for short words/phrases with support for typos, merged/separate spelling
 * and a penalty for word permutation. Adapted from the mcp-jira project.
 *
 * `phraseSimilarity(a, b)` returns a number in [0..1] (1 = identical). The combined metric mixes a
 * character-level comparison of the compacted strings (catches typos and "AI TECH" ~ "AITECH")
 * with a token-level alignment that keeps word order significant.
 */

type Cache<T> = Map<string, T>;

const WORD_RE = /[\p{L}\p{N}_]+/gu; // letters / digits / underscore
const COMBINING_MARKS = /\p{M}/gu; // diacritics (removed after NFKD)

function stripAccents(s: string): string {
  return s.normalize('NFKD').replace(COMBINING_MARKS, '');
}

function normalize(s: string): { tokens: string[]; compact: string } {
  const lower = stripAccents(s).toLowerCase();
  const tokens = lower.match(WORD_RE) ?? [];
  const compact = tokens.join('');
  return { tokens, compact };
}

// ---- OSA (Optimal String Alignment) distance ----

const osaCache: Cache<number> = new Map();

function osaDistance(a: string, b: string): number {
  const key = `${a}${b}`;
  const hit = osaCache.get(key);
  if (hit !== undefined) {
    return hit;
  }

  const n = a.length;
  const m = b.length;
  if (n === 0) {
    osaCache.set(key, m);
    return m;
  }
  if (m === 0) {
    osaCache.set(key, n);
    return n;
  }

  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0) as number[]);
  for (let i = 0; i <= n; i++) {
    dp[i]![0] = i;
  }
  for (let j = 0; j <= m; j++) {
    dp[0]![j] = j;
  }

  for (let i = 1; i <= n; i++) {
    const ai = a.charCodeAt(i - 1);
    for (let j = 1; j <= m; j++) {
      const bj = b.charCodeAt(j - 1);
      const cost = ai === bj ? 0 : 1;
      let best = Math.min(
        dp[i - 1]![j]! + 1, // deletion
        dp[i]![j - 1]! + 1, // insertion
        dp[i - 1]![j - 1]! + cost, // replacement
      );
      // transposition of adjacent characters
      if (
        i > 1 &&
        j > 1 &&
        a.charCodeAt(i - 1) === b.charCodeAt(j - 2) &&
        a.charCodeAt(i - 2) === b.charCodeAt(j - 1)
      ) {
        best = Math.min(best, dp[i - 2]![j - 2]! + 1);
      }
      dp[i]![j] = best;
    }
  }

  const result = dp[n]![m]!;
  osaCache.set(key, result);
  return result;
}

const charSimCache: Cache<number> = new Map();

function charSimilarity(a: string, b: string): number {
  if (!a && !b) {
    return 1;
  }
  if (!a || !b) {
    return 0;
  }
  const key = `${a}${b}`;
  const hit = charSimCache.get(key);
  if (hit !== undefined) {
    return hit;
  }

  const d = osaDistance(a, b);
  const sim = Math.max(0, 1 - d / Math.max(a.length, b.length));
  charSimCache.set(key, sim);
  return sim;
}

// ---- Token alignment considering order (weighted LCS) ----

function tokenSimilarity(tokensA: string[], tokensB: string[]): number {
  const n = tokensA.length;
  const m = tokensB.length;
  if (n === 0 && m === 0) {
    return 1;
  }
  if (n === 0 || m === 0) {
    return 0;
  }

  // precompute pairwise token similarities
  const sim: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: m }, (__, j) => charSimilarity(tokensA[i]!, tokensB[j]!)),
  );

  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0) as number[]);
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]! + sim[i - 1]![j - 1]!);
    }
  }
  const best = dp[n]![m]!;
  return best / Math.max(n, m); // normalization: penalize omissions / permutations
}

// ---- Combined metric ----

export function phraseSimilarity(a: string, b: string): number {
  const { tokens: ta, compact: ca } = normalize(a);
  const { tokens: tb, compact: cb } = normalize(b);

  const simChar = charSimilarity(ca, cb); // merged comparison (catches typos and AITECH ~ AI TECH)
  const simTok = tokenSimilarity(ta, tb); // order matters (penalizes TECH AI)

  // weighted combination + "insurance" against pseudo-matches of tokens
  const combo = 0.6 * simChar + 0.4 * simTok;
  return Math.max(combo, simChar * 0.9);
}
