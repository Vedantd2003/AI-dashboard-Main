import { Schema, model } from 'mongoose';

const workflowDefinitionSchema = new Schema(
  {
    key: { type: String, enum: ['daily_brief', 'watchlist_monitor', 'weekly_digest', 'source_health'], required: true },
    name: { type: String, required: true },
    description: String,
    enabled: { type: Boolean, default: false },
    /** 5-field cron, interpreted in `timezone`. Used by the in-process scheduler; n8n holds its own copy. */
    schedule: { type: String, required: true },
    timezone: { type: String, default: 'America/New_York' },
    trigger: { type: String, enum: ['scheduler', 'n8n', 'manual'], default: 'manual' },
    timeoutMs: { type: Number, default: 120_000 },
    maxRetries: { type: Number, default: 2 },
    lastRunAt: Date,
    lastStatus: String,
  },
  { timestamps: true },
);
workflowDefinitionSchema.index({ key: 1 }, { unique: true });
export const WorkflowDefinition = model('WorkflowDefinition', workflowDefinitionSchema, 'workflowDefinitions');

const workflowExecutionSchema = new Schema(
  {
    workflowKey: { type: String, required: true },
    idempotencyKey: { type: String, required: true },
    trigger: { type: String, enum: ['scheduler', 'n8n', 'manual'], required: true },
    triggeredBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    status: { type: String, enum: ['running', 'succeeded', 'failed', 'skipped'], required: true },
    attempt: { type: Number, default: 1 },
    startedAt: { type: Date, required: true },
    finishedAt: Date,
    durationMs: Number,
    metrics: { type: Schema.Types.Mixed, default: {} },
    error: { type: String, default: null },
    rerunOf: { type: Schema.Types.ObjectId, ref: 'WorkflowExecution', default: null },
  },
  { timestamps: true },
);
workflowExecutionSchema.index({ idempotencyKey: 1 }, { unique: true });
workflowExecutionSchema.index({ workflowKey: 1, startedAt: -1 });
workflowExecutionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });
export const WorkflowExecution = model('WorkflowExecution', workflowExecutionSchema, 'workflowExecutions');

const providerHealthSchema = new Schema(
  {
    provider: { type: String, required: true },
    status: { type: String, enum: ['ok', 'degraded', 'down', 'not_configured'], required: true },
    latencyMs: Number,
    checkedAt: { type: Date, required: true },
    detail: String,
    lastDataAsOf: Date,
    stale: Boolean,
  },
  { timestamps: false },
);
providerHealthSchema.index({ provider: 1, checkedAt: -1 });
providerHealthSchema.index({ checkedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });
export const ProviderHealth = model('ProviderHealth', providerHealthSchema, 'providerHealth');

const auditEventSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    action: { type: String, required: true },
    target: { type: String, default: null },
    ip: String,
    meta: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
auditEventSchema.index({ userId: 1, createdAt: -1 });
auditEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 365 });
export const AuditEvent = model('AuditEvent', auditEventSchema, 'auditEvents');

const migrationSchema = new Schema({ name: { type: String, unique: true }, appliedAt: Date });
export const Migration = model('Migration', migrationSchema, 'migrations');
