'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { forgotPasswordSchema, loginSchema, passwordSchema, registerSchema } from '@alphapulse/shared';
import { api, ApiError } from '@/lib/api';
import { Logo } from './logo';
import { Button, Field, Input } from './ui/primitives';

export function AuthFrame({ title, intro, children, footer }: { title: string; intro?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center px-4 py-12">
      <main id="main" className="w-full max-w-[400px]">
        <Link href="/" className="mb-10 inline-block" aria-label="AlphaPulse AI home">
          <Logo />
        </Link>
        <h1 className="font-serif text-[2rem] leading-tight font-medium">{title}</h1>
        {intro && <p className="mt-2 text-base text-ink-2">{intro}</p>}
        <div className="mt-8">{children}</div>
        {footer && <div className="mt-8 border-t border-line pt-5 text-sm text-ink-2">{footer}</div>}
      </main>
    </div>
  );
}

function FormError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-[var(--radius-control)] border border-down/40 bg-down/5 px-3 py-2 text-sm text-down">
      {error}
    </p>
  );
}

/** Only allow same-origin relative redirect targets. */
const safeNext = (n: string | null) => (n && n.startsWith('/app') && !n.startsWith('//') ? n : '/app');

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const f = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema) });
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={f.handleSubmit(async (v) => {
        setError(null);
        try {
          await api.post('/auth/login', v);
          await qc.invalidateQueries({ queryKey: ['me'] });
          router.replace(safeNext(params.get('next')));
        } catch (e) {
          setError(e instanceof ApiError ? e.message : 'Could not sign in.');
        }
      })}
    >
      <FormError error={error} />
      <Field label="Email" htmlFor="email" error={f.formState.errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" aria-invalid={!!f.formState.errors.email} {...f.register('email')} />
      </Field>
      <Field label="Password" htmlFor="password" error={f.formState.errors.password?.message}>
        <Input id="password" type="password" autoComplete="current-password" aria-invalid={!!f.formState.errors.password} {...f.register('password')} />
      </Field>
      <div className="flex items-center justify-between">
        <Link href="/forgot-password" className="text-sm text-info hover:underline">
          Forgot your password?
        </Link>
      </div>
      <Button type="submit" variant="primary" loading={f.formState.isSubmitting}>
        Sign in
      </Button>
    </form>
  );
}

export function RegisterForm() {
  const router = useRouter();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const f = useForm<z.infer<typeof registerSchema>>({ resolver: zodResolver(registerSchema) });
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={f.handleSubmit(async (v) => {
        setError(null);
        try {
          await api.post('/auth/register', v);
          await qc.invalidateQueries({ queryKey: ['me'] });
          router.replace('/app?welcome=1');
        } catch (e) {
          setError(e instanceof ApiError ? e.message : 'Could not create the account.');
        }
      })}
    >
      <FormError error={error} />
      <Field label="Name" htmlFor="name" error={f.formState.errors.name?.message}>
        <Input id="name" autoComplete="name" aria-invalid={!!f.formState.errors.name} {...f.register('name')} />
      </Field>
      <Field label="Email" htmlFor="email" error={f.formState.errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" aria-invalid={!!f.formState.errors.email} {...f.register('email')} />
      </Field>
      <Field label="Password" htmlFor="password" hint="At least 10 characters, with letters and a number." error={f.formState.errors.password?.message}>
        <Input id="password" type="password" autoComplete="new-password" aria-invalid={!!f.formState.errors.password} {...f.register('password')} />
      </Field>
      <p className="text-caption text-ink-3">AlphaPulse is a research tool. Nothing it produces is financial advice, and it never places trades.</p>
      <Button type="submit" variant="primary" loading={f.formState.isSubmitting}>
        Create account
      </Button>
    </form>
  );
}

export function ForgotForm() {
  const [done, setDone] = useState<{ emailConfigured: boolean; message?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const f = useForm<z.infer<typeof forgotPasswordSchema>>({ resolver: zodResolver(forgotPasswordSchema) });
  if (done) {
    return done.emailConfigured ? (
      <p className="text-base text-ink-2">If an account exists for that address, a reset link is on its way. It expires in one hour.</p>
    ) : (
      <div className="rounded-[var(--radius-panel)] border border-warn/40 bg-warn/5 px-4 py-3 text-sm text-ink-2">
        <p className="font-medium text-ink">Email delivery isn’t set up on this deployment.</p>
        <p className="mt-1">Ask the administrator for a reset link. They can issue one after confirming your identity (see the account recovery steps in the docs).</p>
      </div>
    );
  }
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={f.handleSubmit(async (v) => {
        try {
          setDone(await api.post('/auth/password/forgot', v));
        } catch (e) {
          setError(e instanceof ApiError ? e.message : 'Could not send the link.');
        }
      })}
    >
      <FormError error={error} />
      <Field label="Email" htmlFor="email" error={f.formState.errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" {...f.register('email')} />
      </Field>
      <Button type="submit" variant="primary" loading={f.formState.isSubmitting}>
        Send reset link
      </Button>
    </form>
  );
}

const resetForm = z.object({ password: passwordSchema, confirm: z.string() }).refine((v) => v.password === v.confirm, { message: 'Passwords do not match', path: ['confirm'] });

export function ResetForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get('token') ?? '';
  const [error, setError] = useState<string | null>(null);
  const f = useForm<z.infer<typeof resetForm>>({ resolver: zodResolver(resetForm) });
  if (!token) return <FormError error="This reset link is incomplete. Request a new one." />;
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={f.handleSubmit(async (v) => {
        try {
          await api.post('/auth/password/reset', { token, password: v.password });
          router.replace('/login?reset=1');
        } catch (e) {
          setError(e instanceof ApiError ? e.message : 'Could not reset the password.');
        }
      })}
    >
      <FormError error={error} />
      <Field label="New password" htmlFor="password" hint="At least 10 characters, with letters and a number." error={f.formState.errors.password?.message}>
        <Input id="password" type="password" autoComplete="new-password" {...f.register('password')} />
      </Field>
      <Field label="Confirm new password" htmlFor="confirm" error={f.formState.errors.confirm?.message}>
        <Input id="confirm" type="password" autoComplete="new-password" {...f.register('confirm')} />
      </Field>
      <Button type="submit" variant="primary" loading={f.formState.isSubmitting}>
        Set new password
      </Button>
    </form>
  );
}
