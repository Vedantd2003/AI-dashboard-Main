import { normalizeText } from './dedupe.js';

/**
 * Citation validation.
 *
 * A claim may cite sources by id with an `evidence` passage. A citation is VALID only if:
 *   1. the sourceId exists in the set of sources retrieved for this run, and
 *   2. the normalized evidence passage (≥ 12 chars) occurs inside the normalized stored source text.
 * Claims whose citations all fail are downgraded to basis "unverified" and their citations removed.
 * Nothing is "fixed up" — invalid citations are dropped, never re-pointed.
 */

export interface CitableSource {
  id: string;
  text: string;
}

export interface Citation {
  sourceId: string;
  evidence: string;
}

export type ClaimBasis = 'observed_data' | 'source_reported' | 'calculated' | 'interpretation' | 'speculative' | 'unverified';

export interface Claim {
  text: string;
  basis: ClaimBasis;
  citations: Citation[];
}

export interface CitationCheck {
  claims: Claim[];
  stats: { total: number; verified: number; downgraded: number; droppedCitations: number };
}

const MIN_EVIDENCE = 12;

export function evidenceSupported(evidence: string, sourceText: string): boolean {
  const e = normalizeText(evidence);
  if (e.length < MIN_EVIDENCE) return false;
  return normalizeText(sourceText).includes(e);
}

/** Bases that require a valid citation; others (calculated, observed_data, interpretation, speculative) may stand alone. */
const NEEDS_CITATION: ReadonlySet<ClaimBasis> = new Set(['source_reported']);

export function validateClaims(claims: readonly Claim[], sources: readonly CitableSource[]): CitationCheck {
  const byId = new Map(sources.map((s) => [s.id, s.text]));
  let verified = 0;
  let downgraded = 0;
  let droppedCitations = 0;
  const out = claims.map((c) => {
    const good = c.citations.filter((cit) => {
      const t = byId.get(cit.sourceId);
      return t !== undefined && evidenceSupported(cit.evidence, t);
    });
    droppedCitations += c.citations.length - good.length;
    if (good.length) verified++;
    if (NEEDS_CITATION.has(c.basis) && good.length === 0) {
      downgraded++;
      return { text: c.text, basis: 'unverified' as const, citations: [] };
    }
    return { ...c, citations: good };
  });
  return { claims: out, stats: { total: claims.length, verified, downgraded, droppedCitations } };
}
