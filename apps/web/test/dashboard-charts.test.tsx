import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ActivityBars, MoversChart, Ring, StatTile } from '@/components/dashboard-charts';

describe('dashboard charts', () => {
  it('movers: sorted high to low with signed values in the accessible table', () => {
    render(<MoversChart caption="Moves" rows={[{ symbol: 'AAA', changePct: -0.01, price: 10, currency: 'USD' }, { symbol: 'BBB', changePct: 0.02, price: 20, currency: 'USD' }]} />);
    const rows = within(screen.getByRole('table', { hidden: true })).getAllByRole('row', { hidden: true });
    expect(rows.map((r) => r.textContent)).toEqual(['BBB+2.00%', 'AAA−1.00%']);
  });

  it('ring: legend lists every segment with its share', () => {
    render(<Ring caption="Claims" center="67%" segments={[{ label: 'Verified', value: 2, color: '#000' }, { label: 'Downgraded', value: 1, color: '#111' }, { label: 'Other', value: 1, color: '#222' }]} />);
    expect(screen.getByText('Verified').closest('tr')!.textContent).toContain('50.0%');
    expect(screen.getByText('67%')).toBeTruthy();
  });

  it('activity: legend names each outcome (never color alone) and the table carries counts', () => {
    render(<ActivityBars caption="Runs" days={[{ date: '2026-10-20', succeeded: 3, failed: 1, skipped: 0 }]} />);
    const legend = screen.getByRole('list', { name: 'Legend' });
    expect(legend.textContent).toBe('SucceededFailedSkipped');
    expect(screen.getByRole('rowheader', { name: '2026-10-20', hidden: true }).closest('tr')!.textContent).toBe('2026-10-20310');
  });

  it('stat tile shows a dash rather than a number when the value is unknown', () => {
    render(<StatTile label="Automation success" value={null} />);
    expect(screen.getByText('—')).toBeTruthy();
  });
});
