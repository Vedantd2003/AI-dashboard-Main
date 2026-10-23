import { Suspense } from 'react';
import { AuthFrame, ResetForm } from '@/components/auth-forms';

export const metadata = { title: 'Choose a new password' };

export default function Page() {
  return (
    <AuthFrame title="Choose a new password" intro="Setting a new password signs you out everywhere else.">
      <Suspense>
        <ResetForm />
      </Suspense>
    </AuthFrame>
  );
}
