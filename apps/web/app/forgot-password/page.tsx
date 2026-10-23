import Link from 'next/link';
import { AuthFrame, ForgotForm } from '@/components/auth-forms';

export const metadata = { title: 'Reset password' };

export default function Page() {
  return (
    <AuthFrame title="Reset your password" intro="We’ll email you a single-use link." footer={<Link href="/login" className="text-info hover:underline">Back to sign in</Link>}>
      <ForgotForm />
    </AuthFrame>
  );
}
