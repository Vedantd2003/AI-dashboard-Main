/**
 * US equity market calendar (NYSE/Nasdaq full-day closures).
 * Source: NYSE published holiday schedule. MUST be reviewed each year — dates beyond the table are treated
 * as "unknown" and only the weekday rule applies (logged as a limitation by callers).
 */
export const NYSE_HOLIDAYS: Record<number, string[]> = {
  2025: ['2025-01-01', '2025-01-09', '2025-01-20', '2025-02-17', '2025-04-18', '2025-05-26', '2025-06-19', '2025-07-04', '2025-09-01', '2025-11-27', '2025-12-25'],
  2026: ['2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25'],
  2027: ['2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24'],
};

export const MARKET_TZ = 'America/New_York';

/** Calendar date (YYYY-MM-DD) and weekday in the market's time zone. */
export function marketLocalDate(now: Date, tz = MARKET_TZ): { date: string; weekday: number } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { date: `${get('year')}-${get('month')}-${get('day')}`, weekday: wd };
}

export function isUsTradingDay(now: Date): { trading: boolean; date: string; reason: string; calendarKnown: boolean } {
  const { date, weekday } = marketLocalDate(now);
  const year = Number(date.slice(0, 4));
  const known = year in NYSE_HOLIDAYS;
  if (weekday === 0 || weekday === 6) return { trading: false, date, reason: 'weekend', calendarKnown: known };
  if (known && NYSE_HOLIDAYS[year]!.includes(date)) return { trading: false, date, reason: 'NYSE holiday', calendarKnown: true };
  return { trading: true, date, reason: known ? 'regular trading day' : 'weekday (holiday table missing for this year)', calendarKnown: known };
}

/** ISO week key, e.g. 2026-W43 */
export function isoWeekKey(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
