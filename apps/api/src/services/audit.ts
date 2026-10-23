import type { Request } from 'express';
import type { Types } from 'mongoose';
import { AuditEvent } from '../models/index.js';

/** Never pass secrets or full request bodies in `meta`. Failures are logged by the caller's logger, not thrown. */
export async function audit(
  action: string,
  opts: { userId?: Types.ObjectId | string | null; req?: Request; target?: string | null; meta?: Record<string, unknown> } = {},
): Promise<void> {
  try {
    await AuditEvent.create({
      userId: opts.userId ?? null,
      action,
      target: opts.target ?? null,
      ip: opts.req?.ip,
      meta: opts.meta ?? {},
    });
  } catch (e) {
    (opts.req as unknown as { log?: { warn: (o: object, m: string) => void } } | undefined)?.log?.warn({ err: (e as Error).message, action }, 'audit write failed');
  }
}
