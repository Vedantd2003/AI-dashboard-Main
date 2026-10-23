'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { ClaimRow } from '@/components/research-note';
import type { Claim, SourceRef } from '@/lib/types';

/**
 * ILLUSTRATIVE ONLY. A fictional company and fictional sources, rendered with the real report components so
 * visitors can try the citation interaction. Labelled as an example in the UI; never presented as market data.
 */
const SOURCES: SourceRef[] = [
  { id: 'S1', documentId: 'example-1', title: 'Northwind Robotics — Form 10-Q, quarter ended June 30', url: null, publisher: 'Example filing', publishedAt: null, retrievedAt: '2026-01-01T00:00:00Z', kind: 'filing', origin: 'primary' },
  { id: 'S2', documentId: 'example-2', title: 'Northwind widens warehouse automation push', url: null, publisher: 'Example newswire', publishedAt: null, retrievedAt: '2026-01-01T00:00:00Z', kind: 'news', origin: 'secondary' },
];

const CLAIMS: Claim[] = [
  { text: 'Service revenue grew faster than hardware for the second quarter in a row.', basis: 'source_reported', citations: [{ sourceId: 'S1', evidence: 'Service revenue increased 18% while hardware revenue increased 4% compared with the prior-year quarter.' }] },
  { text: 'Over the past year the shares fell 14% while the benchmark ETF rose 9%.', basis: 'calculated', citations: [] },
  { text: 'Management is redirecting capital toward recurring software contracts.', basis: 'interpretation', citations: [] },
  { text: 'Customer concentration is a stated risk: two clients account for a large share of orders.', basis: 'source_reported', citations: [{ sourceId: 'S1', evidence: 'Two customers accounted for approximately 41% of net revenue during the period.' }] },
  { text: 'A competitor will cut prices next quarter.', basis: 'unverified', citations: [] },
];

export function HeroNote() {
  const reduce = useReducedMotion();
  return (
    <figure className="relative m-0 rounded-[var(--radius-panel)] border border-line-strong bg-surface-1/90 shadow-[0_40px_120px_-40px_rgba(60,200,192,0.25)]">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <span className="text-sm text-ink-2">Research note</span>
        <span className="rounded-full border border-warn/40 px-2 py-px text-caption text-warn">Example with a fictional company</span>
      </div>
      <div className="px-5 pt-4 pb-5">
        <p className="text-sm text-ink-3">Northwind Robotics (fictional), what changed this quarter?</p>
        <h3 className="mt-1 font-serif text-2xl leading-snug">Services carry the quarter; concentration risk remains</h3>
        <motion.ol
          className="mt-3"
          initial={reduce ? false : 'hidden'}
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.18, delayChildren: 0.25 } } }}
        >
          {CLAIMS.map((c, i) => (
            <motion.div key={i} variants={{ hidden: { opacity: 0, x: -6 }, show: { opacity: 1, x: 0, transition: { duration: 0.32, ease: 'easeOut' } } }}>
              <ClaimRow claim={c} sources={SOURCES} />
            </motion.div>
          ))}
        </motion.ol>
        <p className="mt-2 border-t border-line pt-3 text-caption text-ink-3">Select a gold number to see the passage it rests on. The last line had no supporting source, so it is flagged rather than hidden.</p>
      </div>
    </figure>
  );
}
