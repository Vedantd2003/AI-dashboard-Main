import Link from 'next/link';
import { AuthFrame, RegisterForm } from '@/components/auth-forms';

export const metadata = { title: 'Create account' };

export default function Page() {
  return (
    <AuthFrame
      title="Create your account"
      intro="Watchlists, cited research and scheduled briefs, in one workspace."
      footer={
        <>
          Already have an account?{' '}
          <Link href="/login" className="text-info hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <RegisterForm />
    </AuthFrame>
  );
}
