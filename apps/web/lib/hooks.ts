'use client';

import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError } from './api';
import type { User } from './types';

export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: () => api.get<{ user: User }>('/auth/me').then((r) => r.user), retry: false, staleTime: 60_000 });
}

export const useApiQuery = <T>(key: QueryKey, path: string | null, opts: { refetchInterval?: number; enabled?: boolean } = {}) =>
  useQuery({ queryKey: key, queryFn: () => api.get<T>(path!), enabled: path !== null && (opts.enabled ?? true), refetchInterval: opts.refetchInterval });

/** Mutation with toast feedback. `success` names the completed action, matching the button that triggered it. */
export function useApiMutation<TVars, TRes = unknown>(fn: (v: TVars) => Promise<TRes>, opts: { success?: string | ((r: TRes) => string); invalidate?: QueryKey[]; onSuccess?: (r: TRes, v: TVars) => void } = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r, v) => {
      if (opts.success) toast.success(typeof opts.success === 'function' ? opts.success(r) : opts.success);
      opts.invalidate?.forEach((k) => qc.invalidateQueries({ queryKey: k }));
      opts.onSuccess?.(r, v);
    },
    onError: (e) => {
      const err = e instanceof ApiError ? e : null;
      toast.error(err?.message ?? 'Something went wrong', { description: err?.hint });
    },
  });
}
