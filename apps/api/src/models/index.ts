export * from './user.js';
export * from './workspace.js';
export * from './alerts.js';
export * from './research.js';
export * from './ops.js';

import { User, Session, AuthToken } from './user.js';
import { Watchlist, Portfolio } from './workspace.js';
import { Alert, AlertEvent, Notification } from './alerts.js';
import { SourceDocument, ResearchReport, ResearchRun } from './research.js';
import { WorkflowDefinition, WorkflowExecution, ProviderHealth, AuditEvent, Migration } from './ops.js';

export const allModels = [
  User,
  Session,
  AuthToken,
  Watchlist,
  Portfolio,
  Alert,
  AlertEvent,
  Notification,
  SourceDocument,
  ResearchReport,
  ResearchRun,
  WorkflowDefinition,
  WorkflowExecution,
  ProviderHealth,
  AuditEvent,
  Migration,
];

/** Idempotent: creates missing indexes and drops ones no longer declared. */
export async function syncAllIndexes(): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  for (const m of allModels) {
    out[m.collection.collectionName] = (await m.syncIndexes()) as unknown as string[];
  }
  return out;
}
