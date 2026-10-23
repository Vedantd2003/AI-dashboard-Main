'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { AuthFrame } from '@/components/auth-forms';
import { api, ApiError } from '@/lib/api';

function Verify() {
  const token = useSearchParams().get('token');
  const [state, setState] = useState<'working' | 'ok' | string>('working');
  useEffect(() => {
    if (!token) return setState('This verification link is incomplete.');
    api
      .post('/auth/verify-email/confirm', { token })
      .then(() => setState('ok'))
      .catch((e) => setState(e instanceof ApiError ? e.message : 'Verification failed.'));
  }, [token]);
  if (state === 'working') return <p className="text-ink-2">Verifying…</p>;
  if (state === 'ok')
    return (
      <p className="text-ink-2">
        Your email is verified. <Link href="/app" className="text-info hover:underline">Open your workspace</Link>
      </p>
    );
  return <p role="alert" className="text-down">{state}</p>;
}

export default function Page() {
  return (
    <AuthFrame title="Verify email">
      <Suspense>
        <Verify />
      </Suspense>
    </AuthFrame>
  );
}
