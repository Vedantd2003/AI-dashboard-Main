import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => cleanup());

vi.mock('next/navigation', () => {
  const push = vi.fn();
  const replace = vi.fn();
  return {
    useRouter: () => ({ push, replace, back: vi.fn() }),
    usePathname: () => (globalThis as { __pathname?: string }).__pathname ?? '/app',
    useSearchParams: () => new URLSearchParams((globalThis as { __search?: string }).__search ?? ''),
    useParams: () => ({}),
  };
});
