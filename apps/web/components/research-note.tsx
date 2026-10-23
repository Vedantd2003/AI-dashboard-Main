'use client';

import { useId, useState, type ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import { cx, dateShort } from '@/lib/format';
import type { Claim, ClaimBasis, SourceRef } from '@/lib/types';

/**
 * The margin notation system. Each basis has a distinct glyph AND word, so it never relies on colour alone.
 * Keep in sync with docs/DESIGN_SYSTEM.md.
 */
export const BASIS: Record<ClaimBasis, { glyph: string; label: string; description: string; cls: string }> = {
  observed_data: { glyph: '◆', label: 'Observed', description: 'Directly from market data', cls: 'text-info' },
  source_reported: { glyph: '§', label: 'Source', description: 'Stated in a cited source; passage verified', cls: 'text-gold' },
  calculated: { glyph: 'Σ', label: 'Calculated', description: 'Computed by AlphaPulse from market data', cls: 'text-signal' },
  interpretation: { glyph: '◇', label: 'Interpretation', description: 'Model analysis of the above — may be wrong', cls: 'text-ink-2' },
  speculative: { glyph: '?', label: 'Speculative', description: 'A scenario, not a finding', cls: 'text-warn' },
  unverified: { glyph: '✕', label: 'Unverified', description: 'Could not be matched to any retrieved source text', cls: 'text-down' },
};

export function BasisLegend({ className }: { className?: string }) {
  return (
    <dl className={cx('grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3', className)}>
      {(Object.keys(BASIS) as ClaimBasis[]).map((k) => (
        <div key={k} className="flex items-start gap-2">
          <dt className={cx('w-4 text-center font-serif text-base leading-5', BASIS[k].cls)} aria-hidden>
            {BASIS[k].glyph}
          </dt>
          <dd className="text-sm">
            <span className="text-ink">{BASIS[k].label}</span>
            <span className="block text-caption text-ink-3">{BASIS[k].description}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

function sourceIndex(sources: SourceRef[], id: string) {
  const i = sources.findIndex((s) => s.id === id);
  return i < 0 ? null : i + 1;
}

/** One claim with its margin mark and citation chips. Clicking a chip reveals the verified passage inline. */
export function ClaimRow({ claim, sources, onCite }: { claim: Claim; sources: SourceRef[]; onCite?: (sourceId: string) => void }) {
  const b = BASIS[claim.basis];
  const [open, setOpen] = useState<number | null>(null);
  const pid = useId();
  return (
    <li className="grid grid-cols-[1.75rem_1fr] gap-x-2 py-2.5">
      <span className={cx('pt-0.5 text-center font-serif text-lg leading-6', b.cls)} title={`${b.label}: ${b.description}`} aria-hidden>
        {b.glyph}
      </span>
      <div className="min-w-0">
        <p className="note-prose !text-base">
          <span className="sr-only">{b.label}: </span>
          {claim.text}
          {claim.citations.map((c, i) => {
            const n = sourceIndex(sources, c.sourceId);
            return (
              <button
                key={i}
                type="button"
                aria-expanded={open === i}
                aria-controls={`${pid}-${i}`}
                onClick={() => {
                  setOpen(open === i ? null : i);
                  onCite?.(c.sourceId);
                }}
                className="ml-1 rounded-sm px-1 align-super font-sans text-[0.7rem] font-semibold text-gold hover:bg-gold/15"
                aria-label={`Show cited passage from source ${n ?? c.sourceId}`}
              >
                [{n ?? c.sourceId}]
              </button>
            );
          })}
        </p>
        {claim.basis === 'unverified' && <p className="mt-1 text-caption text-down">Not supported by retrieved sources — treat with caution.</p>}
        {claim.citations.map((c, i) =>
          open === i ? (
            <blockquote key={i} id={`${pid}-${i}`} className="mt-2 border-l-2 border-gold/70 bg-gold/5 py-2 pr-3 pl-3 text-sm text-ink-2">
              “{c.evidence}”
              <SourceLine source={sources.find((s) => s.id === c.sourceId)} />
            </blockquote>
          ) : null,
        )}
      </div>
    </li>
  );
}

export function SourceLine({ source }: { source?: SourceRef }) {
  if (!source) return null;
  return (
    <span className="mt-1 block text-caption text-ink-3">
      {source.publisher ?? 'Unknown publisher'}
      {source.publishedAt ? `, ${dateShort(source.publishedAt)}` : ''}
      {source.url && (
        <>
          {' '}
          <a href={source.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-0.5 text-info hover:underline">
            open source <ExternalLink className="size-3" aria-hidden />
          </a>
        </>
      )}
    </span>
  );
}

export function ClaimSection({ title, claims, sources, empty, children }: { title: string; claims: Claim[]; sources: SourceRef[]; empty?: string; children?: ReactNode }) {
  return (
    <section className="border-t border-line pt-5">
      <h3 className="font-serif text-xl text-ink">{title}</h3>
      {children}
      {claims.length ? (
        <ol className="mt-2">
          {claims.map((c, i) => (
            <ClaimRow key={i} claim={c} sources={sources} />
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-sm text-ink-3">{empty ?? 'Nothing supported by the available evidence.'}</p>
      )}
    </section>
  );
}

export function SourceList({ sources }: { sources: SourceRef[] }) {
  if (!sources.length) return <p className="text-sm text-ink-3">No sources were retrieved for this report.</p>;
  return (
    <ol className="space-y-3">
      {sources.map((s, i) => (
        <li key={s.id} id={`source-${s.id}`} className="grid grid-cols-[1.75rem_1fr] gap-x-2">
          <span className="num pt-0.5 text-right text-sm font-semibold text-gold">{i + 1}</span>
          <div className="min-w-0">
            <p className="text-sm text-ink">
              {s.url ? (
                <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="hover:text-info hover:underline">
                  {s.title}
                </a>
              ) : (
                s.title
              )}
            </p>
            <p className="text-caption text-ink-3">
              {s.origin === 'primary' ? 'Primary source' : s.origin === 'upload' ? 'Your upload' : 'News'} from {s.publisher ?? 'an unknown publisher'}
              {s.publishedAt ? `, published ${dateShort(s.publishedAt)}` : ''}. Retrieved {dateShort(s.retrievedAt)}.
              {s.cited === false ? ' Retrieved but not cited.' : ''}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
