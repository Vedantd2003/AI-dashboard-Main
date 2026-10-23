const nf = (opts: Intl.NumberFormatOptions) => new Intl.NumberFormat('en-US', opts);

export function money(v: number | null | undefined, currency = 'USD', digits = 2) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  try {
    return nf({ style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
  } catch {
    return `${v.toFixed(digits)} ${currency}`;
  }
}

export function num(v: number | null | undefined, digits = 2) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return nf({ minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
}

/** Input is a FRACTION (0.05 → +5.00%). */
export function pct(v: number | null | undefined, digits = 2, signed = true) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const s = nf({ minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Math.abs(v * 100));
  const sign = v > 0 ? '+' : v < 0 ? '−' : '';
  return `${signed ? sign : v < 0 ? '−' : ''}${s}%`;
}

export function compact(v: number | null | undefined, currency?: string | null) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const s = nf({ notation: 'compact', maximumFractionDigits: 2 }).format(v);
  return currency ? `${s} ${currency}` : s;
}

export function dateShort(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function dateTime(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function relative(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const s = Math.round((now - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 14) return `${Math.floor(s / 86400)} d ago`;
  return dateShort(iso);
}

export const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ');
