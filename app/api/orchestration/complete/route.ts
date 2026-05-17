import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { logLeadEvent } from '@/lib/orchestration';
import crypto from 'crypto';

/**
 * Verifies the HMAC-SHA256 signature sent by n8n on the callback request.
 * Uses timing-safe comparison to prevent timing attacks.
 * If N8N_WEBHOOK_SECRET is not configured, verification is skipped (dev mode).
 */
function verifySignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('hex');

  if (!signatureHeader) return false;

  try {
    const sigBuf = Buffer.from(signatureHeader, 'hex');
    const expBuf = Buffer.from(expected, 'hex');
    if (sigBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expBuf);
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  try {
    const webhookSecret = process.env.N8N_WEBHOOK_SECRET;
    let body: { orchestration_id?: string; lead_id?: string; status?: string; error_message?: string };

    if (webhookSecret) {
      // HMAC verification — read raw body first to compute signature
      const rawBody = await req.text();
      const signature = req.headers.get('x-webhook-signature');

      if (!verifySignature(rawBody, signature, webhookSecret)) {
        return NextResponse.json({ error: 'Unauthorized: invalid signature' }, { status: 401 });
      }

      body = JSON.parse(rawBody);
    } else {
      // No secret configured — allow in dev, warn loudly
      console.warn('[orchestration/complete] N8N_WEBHOOK_SECRET is not set. Endpoint is unauthenticated.');
      body = await req.json();
    }

    const { orchestration_id, lead_id, status, error_message } = body;

    if (!orchestration_id || !lead_id || !status) {
      return NextResponse.json({ error: 'Missing required fields: orchestration_id, lead_id, status' }, { status: 400 });
    }

    const supabase = await createAdminClient();

    // Verify the event exists and belongs to the stated lead (prevents cross-lead manipulation)
    const { data: event, error: fetchError } = await supabase
      .from('automation_events')
      .select('id, status, lead_id, created_at')
      .eq('id', orchestration_id)
      .eq('lead_id', lead_id) // Cross-reference: prevents spoofing a different lead's event
      .single();

    if (fetchError || !event) {
      return NextResponse.json({ error: 'Orchestration event not found' }, { status: 404 });
    }

    // Idempotency guard
    if (event.status === 'Success') {
      return NextResponse.json({ message: 'Already processed' }, { status: 200 });
    }

    const duration = Date.now() - new Date(event.created_at).getTime();

    if (status === 'Success') {
      await supabase
        .from('automation_events')
        .update({ status: 'Success', duration_ms: duration, error_message: null })
        .eq('id', orchestration_id);

      await logLeadEvent(lead_id, 'Workflow', 'Intake orchestration completed successfully in n8n.', 'INFO');
    } else {
      await supabase
        .from('automation_events')
        .update({ status: 'Retrying', duration_ms: duration, error_message: error_message || 'Workflow failed in n8n' })
        .eq('id', orchestration_id);

      await logLeadEvent(lead_id, 'Workflow', `Intake orchestration failed in n8n: ${error_message}. Queued for retry.`, 'HIGH');
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
