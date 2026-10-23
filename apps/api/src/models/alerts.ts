import { Schema, model } from 'mongoose';

const alertSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    watchlistId: { type: Schema.Types.ObjectId, ref: 'Watchlist', default: null },
    symbol: { type: String, required: true, maxlength: 20 },
    type: { type: String, enum: ['price_above', 'price_below', 'pct_move'], required: true },
    threshold: { type: Number, required: true },
    cooldownMinutes: { type: Number, default: 1440 },
    channels: { type: [String], enum: ['in_app', 'email', 'webhook'], default: ['in_app'] },
    active: { type: Boolean, default: true },
    lastTriggeredAt: { type: Date, default: null },
    lastEvaluatedAt: { type: Date, default: null },
    lastEvaluation: { type: String, default: null },
    schemaVersion: { type: Number, default: 1 },
  },
  { timestamps: true },
);
alertSchema.index({ userId: 1, active: 1 });
alertSchema.index({ active: 1, symbol: 1 });
export const Alert = model('Alert', alertSchema, 'alerts');

/** One document per triggered alert per cooldown window; the unique key prevents duplicate events under concurrency. */
const alertEventSchema = new Schema(
  {
    alertId: { type: Schema.Types.ObjectId, ref: 'Alert', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    idempotencyKey: { type: String, required: true },
    symbol: String,
    observed: Number,
    reason: String,
    quoteAsOf: Date,
    provider: String,
  },
  { timestamps: true },
);
alertEventSchema.index({ idempotencyKey: 1 }, { unique: true });
alertEventSchema.index({ userId: 1, createdAt: -1 });
export const AlertEvent = model('AlertEvent', alertEventSchema, 'alertEvents');

const deliverySchema = new Schema(
  {
    channel: { type: String, enum: ['in_app', 'email', 'webhook'], required: true },
    /** delivered only after the provider confirmed success. skipped = channel not configured or disabled. */
    status: { type: String, enum: ['pending', 'delivered', 'failed', 'skipped'], required: true },
    attempts: { type: Number, default: 0 },
    providerMessageId: { type: String, default: null },
    error: { type: String, default: null },
    at: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    kind: {
      type: String,
      enum: ['alert_triggered', 'filing_detected', 'brief_ready', 'digest_ready', 'workflow_failed', 'provider_down', 'new_source', 'system'],
      required: true,
    },
    title: { type: String, required: true, maxlength: 200 },
    body: { type: String, maxlength: 4000, default: '' },
    link: { type: String, default: null },
    dedupeKey: { type: String, required: true },
    readAt: { type: Date, default: null },
    deliveries: { type: [deliverySchema], default: [] },
  },
  { timestamps: true },
);
notificationSchema.index({ userId: 1, dedupeKey: 1 }, { unique: true });
notificationSchema.index({ userId: 1, readAt: 1, createdAt: -1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 180 });
export const Notification = model('Notification', notificationSchema, 'notifications');
