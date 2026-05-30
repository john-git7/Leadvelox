import { NextResponse } from 'next/server';
import { generateOpsReport } from '@/app/actions/report';

/**
 * GET /api/report
 *
 * Generates and streams a 30-day operational summary as a CSV download.
 * Requires a valid Supabase session cookie (same auth as the dashboard).
 *
 * Two sheets are emitted in one file, separated by a blank row:
 *   1. Summary metrics
 *   2. Individual lead log
 *   3. Escalation / critical event log
 */
export async function GET() {
  try {
    const report = await generateOpsReport();
    const { meta, summary, leads, escalation_log } = report;

    const esc = (v: unknown): string => {
      const s = String(v ?? '').replace(/"/g, '""');
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s;
    };

    const rows: string[] = [];

    // --- Section 1: Report header ---
    rows.push(`LEADVELOX — OPERATIONAL SUMMARY REPORT`);
    rows.push(`Agency,${esc(meta.agency)}`);
    rows.push(`Period,${esc(meta.period)}`);
    rows.push(`SLA Window (minutes),${esc(meta.sla_minutes)}`);
    rows.push(`Generated At,${esc(new Date(meta.generated_at).toLocaleString())}`);
    rows.push('');

    // --- Section 2: Summary metrics ---
    rows.push('OPERATIONAL METRICS (Last 30 Days)');
    rows.push('Metric,Value');
    Object.entries(summary).forEach(([key, value]) => {
      rows.push(`${esc(key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()))},${esc(value)}`);
    });
    rows.push('');

    // --- Section 3: Lead log ---
    rows.push('LEAD LOG');
    rows.push([
      'Date', 'Name', 'Email', 'Source', 'Status',
      'Decay', 'SLA Status', 'Escalation Level',
      'Duplicate', 'Breach Time', 'Last Contacted',
    ].map(esc).join(','));

    for (const lead of leads) {
      rows.push([
        new Date(lead.created_at).toLocaleString(),
        lead.name,
        lead.email,
        lead.source,
        lead.status,
        lead.decay_status,
        lead.sla_status,
        lead.escalation_level,
        lead.is_duplicate ? 'Yes' : 'No',
        lead.sla_breached_at ? new Date(lead.sla_breached_at).toLocaleString() : '',
        lead.last_contacted_at ? new Date(lead.last_contacted_at).toLocaleString() : 'Never',
      ].map(esc).join(','));
    }
    rows.push('');

    // --- Section 4: Escalation log ---
    rows.push('CRITICAL ESCALATION LOG');
    rows.push(['Date', 'Severity', 'Description'].map(esc).join(','));
    for (const event of escalation_log) {
      rows.push([
        new Date(event.created_at).toLocaleString(),
        event.severity,
        event.description,
      ].map(esc).join(','));
    }

    const csv = rows.join('\r\n');
    const filename = `leadvelox-report-${meta.period.replace(/ to /, '_')}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[/api/report] Error:', msg);
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 });
  }
}
