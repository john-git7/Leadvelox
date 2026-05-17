import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { logLeadEvent } from '@/lib/orchestration';

const MAX_RETRIES = 5;

function calculateBackoff(retryCount: number): Date {
  const baseDelaySecs = 30; // Starts at 30s
  const exponentialDelay = baseDelaySecs * Math.pow(2, retryCount); // 30s, 60s, 120s, 240s, 480s
  return new Date(Date.now() + exponentialDelay * 1000);
}

export async function GET(req: Request) {
  // 1. Optional: Add authorization header check here for Vercel Cron.
  // const authHeader = req.headers.get('authorization');
  // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = await createAdminClient();

  // 2. Fetch pending retries
  const { data: events, error } = await supabase
    .from('automation_events')
    .select('*')
    .eq('status', 'Retrying')
    .lte('next_retry_at', new Date().toISOString())
    .limit(10); // Process in batches

  if (error) {
    console.error('Failed to fetch retry queue:', error);
    return NextResponse.json({ error: 'Failed to fetch queue' }, { status: 500 });
  }

  if (!events || events.length === 0) {
    return NextResponse.json({ success: true, processed: 0 });
  }

  const results = [];

  for (const event of events) {
    const startTime = Date.now();
    try {
      if (!event.endpoint_url || !event.payload) throw new Error('Missing payload or endpoint URL');

      const res = await fetch(event.endpoint_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event.payload),
      });

      const duration = Date.now() - startTime;

      if (res.ok) {
        // Success
        await supabase
          .from('automation_events')
          .update({ status: 'Success', duration_ms: duration, error_message: null })
          .eq('id', event.id);

        await logLeadEvent(event.lead_id, 'Workflow', `Intake orchestration recovered successfully on retry #${event.retry_count + 1}`, 'INFO');
        results.push({ id: event.id, status: 'Success' });
      } else {
        throw new Error(`HTTP Error ${res.status}`);
      }
    } catch (err: any) {
      const duration = Date.now() - startTime;
      const nextCount = event.retry_count + 1;

      if (nextCount >= MAX_RETRIES) {
        // Max Retries Exceeded -> Fail completely
        await supabase
          .from('automation_events')
          .update({ status: 'Failed', retry_count: nextCount, duration_ms: duration, error_message: err.message })
          .eq('id', event.id);

        await logLeadEvent(event.lead_id, 'Workflow', `Intake orchestration FAILED permanently after ${MAX_RETRIES} retries.`, 'CRITICAL');
        results.push({ id: event.id, status: 'Failed' });
      } else {
        // Exponential Backoff
        const nextRetryAt = calculateBackoff(nextCount).toISOString();
        await supabase
          .from('automation_events')
          .update({ retry_count: nextCount, duration_ms: duration, error_message: err.message, next_retry_at: nextRetryAt })
          .eq('id', event.id);

        results.push({ id: event.id, status: 'Retrying', attempt: nextCount });
      }
    }
  }

  return NextResponse.json({ success: true, processed: events.length, results });
}
