/** Uppercase, trim, and validate a ticker-like symbol (e.g. AAPL, BRK.B, RELIANCE.NSE). */
export const SYMBOL_RE = /^[A-Z0-9][A-Z0-9.\-:^]{0,19}$/;

export function normalizeSymbol(raw: string): string | null {
  const s = raw.trim().toUpperCase();
  return SYMBOL_RE.test(s) ? s : null;
}

export function normalizeSymbols(raw: readonly string[], max = 5): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const r of raw) {
    const n = normalizeSymbol(r);
    if (n && !valid.includes(n)) valid.push(n);
    else if (!n) invalid.push(r);
  }
  return { valid: valid.slice(0, max), invalid };
}
