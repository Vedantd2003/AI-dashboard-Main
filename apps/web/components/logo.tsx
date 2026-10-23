/** Original mark: a pulse line resolving into a section sign — signal becoming evidence. */
export function Logo({ withWord = true, className }: { withWord?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ''}`}>
      <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden>
        <rect x="0.5" y="0.5" width="25" height="25" rx="5" fill="#111a2e" stroke="#34476a" />
        <path d="M4 15h4l2-6 3 10 2.5-7H22" fill="none" stroke="#3cc8c0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="22" cy="12" r="1.6" fill="#c9a45c" />
      </svg>
      {withWord && (
        <span className="font-serif text-[1.15rem] font-medium tracking-tight text-ink">
          AlphaPulse<span className="text-ink-3"> AI</span>
        </span>
      )}
    </span>
  );
}
