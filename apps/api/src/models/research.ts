import { Schema, model } from 'mongoose';

/**
 * Stored source material. `text` is the extracted plain text used for citation checking.
 * Global (shared across users) for public sources; user uploads carry `ownerId` and are only visible to the owner.
 */
const sourceDocumentSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    kind: { type: String, enum: ['news', 'filing', 'rss', 'upload', 'ir_page'], required: true },
    origin: { type: String, enum: ['primary', 'secondary', 'upload'], required: true },
    provider: { type: String, required: true },
    url: { type: String, default: null },
    canonicalUrl: { type: String, default: null },
    title: { type: String, required: true, maxlength: 500 },
    publisher: { type: String, default: null },
    publishedAt: { type: Date, default: null },
    retrievedAt: { type: Date, required: true },
    symbols: { type: [String], default: [] },
    text: { type: String, default: '', maxlength: 400_000 },
    summary: { type: String, default: '' },
    contentHash: { type: String, required: true },
    mimeType: { type: String, default: null },
    bytes: { type: Number, default: null },
    extraction: {
      status: { type: String, enum: ['ok', 'partial', 'failed'], default: 'ok' },
      error: { type: String, default: null },
      pages: { type: Number, default: null },
    },
    meta: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);
sourceDocumentSchema.index({ ownerId: 1, contentHash: 1 }, { unique: true });
sourceDocumentSchema.index({ symbols: 1, publishedAt: -1 });
sourceDocumentSchema.index({ canonicalUrl: 1 });
sourceDocumentSchema.index({ title: 'text', summary: 'text' });
export const SourceDocument = model('SourceDocument', sourceDocumentSchema, 'sourceDocuments');

const claimSchema = new Schema(
  {
    text: String,
    basis: { type: String, enum: ['observed_data', 'source_reported', 'calculated', 'interpretation', 'speculative', 'unverified'] },
    citations: [{ _id: false, sourceId: String, evidence: String }],
  },
  { _id: false },
);

const sourceRefSchema = new Schema(
  {
    id: String,
    documentId: { type: Schema.Types.ObjectId, ref: 'SourceDocument' },
    title: String,
    url: String,
    publisher: String,
    publishedAt: Date,
    retrievedAt: Date,
    kind: String,
    origin: String,
    cited: Boolean,
  },
  { _id: false },
);

const researchReportSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    runId: { type: Schema.Types.ObjectId, ref: 'ResearchRun' },
    kind: { type: String, enum: ['research', 'daily_brief', 'weekly_digest'], default: 'research' },
    title: { type: String, required: true, maxlength: 300 },
    researchQuestion: { type: String, required: true },
    symbols: { type: [String], default: [] },
    generatedAt: { type: Date, required: true },
    executiveSummary: String,
    keyFindings: [claimSchema],
    bullishFactors: [claimSchema],
    bearishFactors: [claimSchema],
    risks: [claimSchema],
    uncertainties: [String],
    followUpQuestions: [String],
    limitations: [String],
    evidenceStrength: { type: String, enum: ['weak', 'moderate', 'strong'] },
    financialMetrics: { type: Schema.Types.Mixed, default: {} },
    sourceReferences: [sourceRefSchema],
    citationStats: { total: Number, verified: Number, downgraded: Number, droppedCitations: Number },
    dataFreshness: { type: Schema.Types.Mixed, default: {} },
    model: String,
    disclaimer: String,
    saved: { type: Boolean, default: false },
    /** Absent unless sharing is enabled (null would collide in the unique index). */
    shareToken: { type: String },
    schemaVersion: { type: Number, default: 1 },
  },
  { timestamps: true },
);
researchReportSchema.index({ userId: 1, kind: 1, generatedAt: -1 });
researchReportSchema.index({ shareToken: 1 }, { unique: true, partialFilterExpression: { shareToken: { $type: 'string' } } });
researchReportSchema.index({ title: 'text', executiveSummary: 'text', researchQuestion: 'text' });
export const ResearchReport = model('ResearchReport', researchReportSchema, 'researchReports');

const researchRunSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    request: { type: Schema.Types.Mixed, required: true },
    status: { type: String, enum: ['queued', 'running', 'succeeded', 'failed'], default: 'queued' },
    steps: [
      {
        _id: false,
        name: String,
        status: { type: String, enum: ['ok', 'skipped', 'failed'] },
        detail: String,
        ms: Number,
      },
    ],
    error: { type: String, default: null },
    model: String,
    usage: { promptTokens: Number, completionTokens: Number },
    reportId: { type: Schema.Types.ObjectId, ref: 'ResearchReport', default: null },
    startedAt: Date,
    finishedAt: Date,
  },
  { timestamps: true },
);
researchRunSchema.index({ userId: 1, createdAt: -1 });
export const ResearchRun = model('ResearchRun', researchRunSchema, 'researchRuns');
