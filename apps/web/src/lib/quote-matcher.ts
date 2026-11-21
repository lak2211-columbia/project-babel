/**
 * Pure NFKC + whitespace/hyphen-insensitive quote matcher that maps normalized
 * spans back to exact original character offsets in a parsed section (C4).
 * Zero dependencies, safe in both server/client components and unit tests.
 */

export type QuoteGroundingStatus = "verbatim" | "approximate" | "not_found";

export type QuoteMatchResult = {
  sectionIndex: number;
  startChar: number;
  endChar: number;
  status: QuoteGroundingStatus;
};

type NormalizedMap = {
  text: string;
  /** origStart[i] = original index in source corresponding to normalized char i */
  origStart: number[];
  /** origEnd[i] = exclusive original index in source corresponding to normalized char i */
  origEnd: number[];
};

const DASH_LIKE = /[\u2010-\u2015\u2212-]/;
const SOFT_HYPHEN = "\u00ad";

/**
 * Normalizes a string using Unicode NFKC, strips soft hyphens and line-break
 * hyphenations (`word-\nnext` -> `wordnext`), collapses all whitespace runs to
 * a single space, and lowercases — while recording the exact original character
 * range for every emitted normalized character.
 */
function buildNormalizedMap(raw: string): NormalizedMap {
  const chars: string[] = [];
  const origStart: number[] = [];
  const origEnd: number[] = [];

  let i = 0;
  let lastWasSpace = true;

  while (i < raw.length) {
    const ch = raw[i];

    // Strip soft hyphens completely
    if (ch === SOFT_HYPHEN) {
      i += 1;
      continue;
    }

    // De-hyphenate line breaks: hyphen + optional spaces + newline + optional spaces
    if (DASH_LIKE.test(ch)) {
      let j = i + 1;
      while (j < raw.length && (raw[j] === " " || raw[j] === "\t")) j += 1;
      if (j < raw.length && (raw[j] === "\n" || raw[j] === "\r")) {
        while (j < raw.length && /[\s]/.test(raw[j])) j += 1;
        i = j;
        continue;
      }
    }

    // Collapse whitespace runs into a single space
    if (/\s/.test(ch)) {
      const start = i;
      while (i < raw.length && /\s/.test(raw[i])) i += 1;
      if (!lastWasSpace) {
        chars.push(" ");
        origStart.push(start);
        origEnd.push(i);
        lastWasSpace = true;
      }
      continue;
    }

    // Normalize single codepoint via NFKC + lowercase (handles fullwidth CJK/Latin punctuation)
    const norm = ch.normalize("NFKC").toLowerCase();
    for (let k = 0; k < norm.length; k += 1) {
      const nch = norm[k];
      if (/\s/.test(nch)) {
        if (!lastWasSpace) {
          chars.push(" ");
          origStart.push(i);
          origEnd.push(i + 1);
          lastWasSpace = true;
        }
      } else {
        chars.push(nch);
        origStart.push(i);
        origEnd.push(i + 1);
        lastWasSpace = false;
      }
    }
    i += 1;
  }

  // Trim trailing single space
  if (chars.length > 0 && chars[chars.length - 1] === " ") {
    chars.pop();
    origStart.pop();
    origEnd.pop();
  }

  return { text: chars.join(""), origStart, origEnd };
}

function normalizeQuery(quote: string): string {
  return buildNormalizedMap(quote).text;
}

/**
 * Matches a single quote inside one section string, returning original char offsets.
 */
export function matchQuoteInText(
  content: string,
  quote: string,
  persistedOffsets?: { startChar?: number | null; endChar?: number | null },
): { startChar: number; endChar: number; status: QuoteGroundingStatus } | null {
  const trimmed = quote.trim();
  if (!trimmed || !content) return null;

  // 1. Honor persisted char offsets from pipeline v2+ ONLY when the sliced text
  // genuinely matches the quote under normalized comparison (guards against
  // plain_text vs section offset shifts).
  if (
    typeof persistedOffsets?.startChar === "number" &&
    typeof persistedOffsets?.endChar === "number" &&
    persistedOffsets.startChar >= 0 &&
    persistedOffsets.endChar > persistedOffsets.startChar &&
    persistedOffsets.endChar <= content.length
  ) {
    const slice = content.slice(
      persistedOffsets.startChar,
      persistedOffsets.endChar,
    );
    const normSlice = normalizeQuery(slice).replace(/\s+/g, "");
    const normTarget = normalizeQuery(trimmed).replace(/\s+/g, "");
    if (normSlice && normTarget && normSlice === normTarget) {
      return {
        startChar: persistedOffsets.startChar,
        endChar: persistedOffsets.endChar,
        status: "verbatim",
      };
    }
  }

  // 2. Fast exact (case-insensitive) substring check
  const directIdx = content.toLowerCase().indexOf(trimmed.toLowerCase());
  if (directIdx >= 0) {
    return {
      startChar: directIdx,
      endChar: directIdx + trimmed.length,
      status: "verbatim",
    };
  }

  // 3. NFKC + whitespace/line-break hyphen-insensitive match mapped to exact original offsets
  const normContent = buildNormalizedMap(content);
  const normQuote = normalizeQuery(trimmed);
  if (!normQuote) return null;

  const normIdx = normContent.text.indexOf(normQuote);
  if (normIdx >= 0) {
    const endNormIdx = normIdx + normQuote.length - 1;
    const startChar = normContent.origStart[normIdx];
    const endChar = normContent.origEnd[endNormIdx];
    if (typeof startChar === "number" && typeof endChar === "number" && endChar > startChar) {
      return { startChar, endChar, status: "verbatim" };
    }
  }

  // 3b. Space-collapsed NFKC match for fullwidth/CJK punctuation spacing drift
  // (e.g. "systems（including" vs "systems (including")
  const compactChars: string[] = [];
  const compactStart: number[] = [];
  const compactEnd: number[] = [];
  for (let i = 0; i < normContent.text.length; i += 1) {
    if (normContent.text[i] === " ") continue;
    compactChars.push(normContent.text[i]);
    compactStart.push(normContent.origStart[i]);
    compactEnd.push(normContent.origEnd[i]);
  }
  const compactQuote = normQuote.replace(/\s+/g, "");
  if (compactQuote.length >= 8) {
    const cIdx = compactChars.join("").indexOf(compactQuote);
    if (cIdx >= 0) {
      const startChar = compactStart[cIdx];
      const endChar = compactEnd[cIdx + compactQuote.length - 1];
      if (typeof startChar === "number" && typeof endChar === "number" && endChar > startChar) {
        return { startChar, endChar, status: "verbatim" };
      }
    }
  }

  // 4. Ordered-window / anchor fallback for ellipsis or minor OCR gaps (approximate)
  const words = normQuote.split(" ").filter((w) => w.length >= 4);
  if (words.length >= 4) {
    const firstAnchor = words.slice(0, 3).join(" ");
    const lastAnchor = words.slice(-3).join(" ");
    const startPos = normContent.text.indexOf(firstAnchor);
    if (startPos >= 0) {
      const searchFrom = startPos + firstAnchor.length;
      const endPos = normContent.text.indexOf(lastAnchor, searchFrom);
      if (endPos >= 0 && endPos - startPos <= normQuote.length * 2.2) {
        const endNormIdx = endPos + lastAnchor.length - 1;
        return {
          startChar: normContent.origStart[startPos],
          endChar: normContent.origEnd[endNormIdx],
          status: "approximate",
        };
      }
      // Fallback to highlighting the opening anchor clause if closing drifted
      const anchorEnd = Math.min(
        startPos + Math.min(normQuote.length, 90) - 1,
        normContent.origEnd.length - 1,
      );
      return {
        startChar: normContent.origStart[startPos],
        endChar: normContent.origEnd[anchorEnd],
        status: "approximate",
      };
    }
  }

  // CJK prefix anchor (no spaces in ZH/JA)
  if (normQuote.length >= 16) {
    const prefix = normQuote.slice(0, Math.min(28, normQuote.length));
    const pIdx = normContent.text.indexOf(prefix);
    if (pIdx >= 0) {
      const endNormIdx = Math.min(
        pIdx + Math.min(normQuote.length, prefix.length * 2) - 1,
        normContent.origEnd.length - 1,
      );
      return {
        startChar: normContent.origStart[pIdx],
        endChar: normContent.origEnd[endNormIdx],
        status: "approximate",
      };
    }
  }

  return null;
}

/**
 * Searches all parsed sections for the best match of a quote.
 * Prefers a verbatim match in any section before accepting an approximate match.
 */
export function findQuoteAcrossSections(
  sections: readonly { content: string }[],
  quote: string,
  persistedOffsets?: { startChar?: number | null; endChar?: number | null },
): QuoteMatchResult {
  let approximateFallback: QuoteMatchResult | null = null;

  for (let i = 0; i < sections.length; i += 1) {
    const match = matchQuoteInText(
      sections[i].content,
      quote,
      sections.length === 1 ? persistedOffsets : undefined,
    );
    if (!match) continue;
    if (match.status === "verbatim") {
      return { sectionIndex: i, ...match };
    }
    if (!approximateFallback) {
      approximateFallback = { sectionIndex: i, ...match };
    }
  }

  if (approximateFallback) {
    return approximateFallback;
  }

  return { sectionIndex: -1, startChar: -1, endChar: -1, status: "not_found" };
}
