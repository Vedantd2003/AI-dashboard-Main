import { Schema, model, type InferSchemaType, type Types } from 'mongoose';

const notificationPrefs = new Schema(
  {
    inApp: { type: Boolean, default: true },
    email: { type: Boolean, default: false },
    webhook: { type: Boolean, default: false },
    webhookUrl: { type: String, default: null },
    dailyBrief: { type: Boolean, default: true },
    weeklyDigest: { type: Boolean, default: true },
  },
  { _id: false },
);

const userSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
    name: { type: String, required: true, maxlength: 80 },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    emailVerifiedAt: { type: Date, default: null },
    timezone: { type: String, default: 'UTC' },
    dashboardWidgets: {
      type: [String],
      default: ['market', 'watchlists', 'headlines', 'research', 'alerts', 'workflows', 'health'],
    },
    notificationPrefs: { type: notificationPrefs, default: () => ({}) },
    unsubscribeToken: { type: String, select: false },
    schemaVersion: { type: Number, default: 1 },
  },
  { timestamps: true, strict: 'throw' },
);
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ unsubscribeToken: 1 }, { unique: true, partialFilterExpression: { unsubscribeToken: { $type: 'string' } } });

export type UserDoc = InferSchemaType<typeof userSchema> & { _id: Types.ObjectId };
export const User = model('User', userSchema, 'users');

const sessionSchema = new Schema(
  {
    tokenHash: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date, required: true },
    absoluteExpiresAt: { type: Date, required: true },
    userAgent: { type: String, maxlength: 300 },
  },
  { timestamps: true },
);
sessionSchema.index({ tokenHash: 1 }, { unique: true });
sessionSchema.index({ userId: 1 });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const Session = model('Session', sessionSchema, 'sessions');

/** Single-use tokens for email verification and password reset. Only the hash is stored. */
const authTokenSchema = new Schema(
  {
    tokenHash: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    purpose: { type: String, enum: ['verify_email', 'reset_password'], required: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
authTokenSchema.index({ tokenHash: 1 }, { unique: true });
authTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const AuthToken = model('AuthToken', authTokenSchema, 'authTokens');
