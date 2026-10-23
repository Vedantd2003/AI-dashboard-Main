import { Schema, model } from 'mongoose';

/**
 * Watchlist items and portfolio positions are embedded: always read with their parent and bounded
 * (≤ 100 items, ≤ 200 positions), so a separate collection would add round-trips and orphan cleanup.
 */

const watchlistItemSchema = new Schema(
  {
    symbol: { type: String, required: true, maxlength: 20 },
    note: { type: String, maxlength: 1000, default: '' },
    addedAt: { type: Date, default: () => new Date() },
  },
  { _id: true },
);

const watchlistSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, maxlength: 60 },
    description: { type: String, maxlength: 280, default: '' },
    items: {
      type: [watchlistItemSchema],
      default: [],
      validate: { validator: (v: unknown[]) => v.length <= 100, message: 'A watchlist holds at most 100 symbols' },
    },
    schemaVersion: { type: Number, default: 1 },
  },
  { timestamps: true },
);
watchlistSchema.index({ userId: 1, name: 1 }, { unique: true });
watchlistSchema.index({ 'items.symbol': 1 });
export const Watchlist = model('Watchlist', watchlistSchema, 'watchlists');

const positionSchema = new Schema(
  {
    symbol: { type: String, required: true, maxlength: 20 },
    quantity: { type: Number, required: true, min: 0 },
    averageCost: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, default: 'USD', maxlength: 3 },
    purchaseDate: { type: String, default: null },
  },
  { _id: true },
);

const portfolioSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, maxlength: 60 },
    /** Always 'hypothetical' — no brokerage integration exists. */
    kind: { type: String, enum: ['hypothetical'], default: 'hypothetical' },
    baseCurrency: { type: String, default: 'USD' },
    benchmark: { type: String, default: 'SPY' },
    positions: {
      type: [positionSchema],
      default: [],
      validate: { validator: (v: unknown[]) => v.length <= 200, message: 'At most 200 positions' },
    },
    schemaVersion: { type: Number, default: 1 },
  },
  { timestamps: true },
);
portfolioSchema.index({ userId: 1, updatedAt: -1 });
export const Portfolio = model('Portfolio', portfolioSchema, 'portfolios');
