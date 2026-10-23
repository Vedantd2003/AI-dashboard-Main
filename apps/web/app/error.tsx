'use client';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="grid min-h-[60vh] place-items-center px-4">
      <div className="max-w-md" role="alert">
        <h1 className="font-serif text-3xl">This page failed to load</h1>
        <p className="mt-2 text-ink-2">An unexpected error stopped the page from rendering.{error.digest ? ` Reference ${error.digest}.` : ''}</p>
        <button onClick={reset} className="mt-6 rounded-[var(--radius-control)] border border-line-strong px-4 py-2 text-sm hover:bg-surface-2">
          Reload this page
        </button>
      </div>
    </main>
  );
}
