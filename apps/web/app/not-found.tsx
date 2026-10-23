import Link from 'next/link';

export default function NotFound() {
  return (
    <main id="main" className="grid min-h-screen place-items-center px-4">
      <div className="max-w-md">
        <h1 className="font-serif text-3xl">This page doesn’t exist</h1>
        <p className="mt-2 text-ink-2">The link may be old, or the item was deleted.</p>
        <div className="mt-6 flex gap-4 text-sm">
          <Link href="/app" className="text-info hover:underline">
            Go to your workspace
          </Link>
          <Link href="/" className="text-info hover:underline">
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
