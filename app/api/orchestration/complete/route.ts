import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { logLeadEvent } from '@/lib/orchestration';
import { verifyWebhookSignature } from '@/lib/webhook-signature';

export async function POST(req: Request) {
  try {
    const webhookSecret = process.env.N8N_WEBHOOK_SECRET;
    let body: {
      orchestration_id?: string;
      lead_id?: string;
      status?: string;
      error_message?: string;
      delivery_status?: string;
      provider?: string;
      message_id?: string;
    };

    if (process.env.NODE_ENV === 'production' && !webhookSecret) {
      console.error('[orchestration/complete] N8N_WEBHOOK_SECRET is required in production.');
      return NextResponse.json({ error: 'Server Configuration Error' }, { status: 500 });
    }

    if (webhookSecret) {
      // HMAC verification — read raw body first to compute signature
      const rawBody = await req.text();
      const signature = req.headers.get('x-webhook-signature');

      if (!verifyWebhookSignature(rawBody, signature, webhookSecret)) {
        return NextResponse.json({ error: 'Unauthorized: invalid signature' }, { status: 401 });
      }

      body = JSON.parse(rawBody);
    } else {
      // No secret configured — allow in dev, warn loudly
      console.warn('[orchestration/complete] N8N_WEBHOOK_SECRET is not set. Endpoint is unauthenticated.');
      body = await req.json();
    }

    const { orchestration_id, lead_id, status, error_message, delivery_status, provider, message_id } = body;

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

    const isSuccess = ['success', 'delivered'].includes(status.trim().toLowerCase());

    if (isSuccess) {
      const { error: updateError } = await supabase
        .from('automation_events')
        .update({ status: 'Success', error_message: null, duration_ms: duration })
        .eq('id', orchestration_id);
        
      if (updateError) {
        console.error('[orchestration/complete] Failed to update success:', updateError);
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      await logLeadEvent(
        lead_id,
        'Workflow',
        delivery_status
          ? `n8n completed. Notification ${delivery_status}${provider ? ` via ${provider}` : ''}.`
          : 'Intake orchestration completed successfully in n8n.',
        'INFO',
        { delivery_status, provider, message_id }
      );
    } else {
      await supabase
        .from('automation_events')
        .update({ status: 'Retrying', error_message: error_message || 'Workflow failed in n8n' })
        .eq('id', orchestration_id);

      await logLeadEvent(
        lead_id,
        'Workflow',
        `Intake orchestration failed in n8n: RAW_STATUS='${status}' | ERR='${error_message || 'Unknown'}'. Queued for retry.`,
        'HIGH',
        { delivery_status, provider, message_id }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
