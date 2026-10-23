import Link from 'next/link';
import { Suspense } from 'react';
import { AuthFrame, LoginForm } from '@/components/auth-forms';

export const metadata = { title: 'Sign in' };

export default function Page() {
  return (
    <AuthFrame
      title="Sign in"
      intro="Pick up your research where you left it."
      footer={
        <>
          New to AlphaPulse?{' '}
          <Link href="/register" className="text-info hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthFrame>
  );
}
