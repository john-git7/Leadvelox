import { redirect } from 'next/navigation';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { CheckCircle2, XCircle, AlertTriangle, ArrowLeft, ShieldCheck } from 'lucide-react';
import { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Setup Check | LeadVelox',
  description: 'Deployment readiness validation for LeadVelox operators.',
};

type CheckStatus = 'pass' | 'fail' | 'warn';

type Check = {
  label: string;
  detail: string;
  status: CheckStatus;
  remedy?: string;
};

function StatusIcon({ status }: { status: CheckStatus }) {
  if (status === 'pass') return <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />;
  if (status === 'fail') return <XCircle className="w-4 h-4 text-red-500 shrink-0" />;
  return <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0" />;
}

function StatusBadge({ status }: { status: CheckStatus }) {
  const cls =
    status === 'pass'
      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
      : status === 'fail'
      ? 'bg-red-500/10 text-red-400 border-red-500/20'
      : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold border uppercase tracking-widest ${cls}`}>
      {status === 'pass' ? 'PASS' : status === 'fail' ? 'FAIL' : 'WARN'}
    </span>
  );
}

export default async function SetupCheckPage() {
  // ADMIN-only gate
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'ADMIN') redirect('/dashboard');

  // ── Run all checks ────────────────────────────────────────────────────────
  const checks: Check[] = [];

  // 1. Database connectivity
  const { error: dbError } = await supabase.from('leads').select('id').limit(1);
  checks.push({
    label: 'Database Connection',
    detail: dbError ? `Supabase error: ${dbError.message}` : 'Supabase read probe succeeded.',
    status: dbError ? 'fail' : 'pass',
    remedy: 'Verify NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set correctly.',
  });

  // 2. Admin client (service role key)
  let adminOk = false;
  try {
    const admin = await createAdminClient();
    const { error: adminErr } = await admin.from('leads').select('id').limit(1);
    adminOk = !adminErr;
  } catch { /* fall through */ }
  checks.push({
    label: 'Service Role Key',
    detail: adminOk
      ? 'SUPABASE_SERVICE_ROLE_KEY is valid and working.'
      : 'createAdminClient failed — service role key may be missing or invalid.',
    status: adminOk ? 'pass' : 'fail',
    remedy: 'Set SUPABASE_SERVICE_ROLE_KEY in your deployment environment.',
  });

  // 3. Cron heartbeat age
  const { data: heartbeat } = await supabase
    .from('cron_heartbeat')
    .select('last_heartbeat')
    .eq('id', 1)
    .single();

  let cronStatus: CheckStatus = 'fail';
  let cronDetail = 'No heartbeat row found. Cron has never run.';
  if (heartbeat?.last_heartbeat) {
    const ageMinutes = (Date.now() - new Date(heartbeat.last_heartbeat).getTime()) / 60000;
    if (ageMinutes < 2) {
      cronStatus = 'pass';
      cronDetail = `Last heartbeat ${Math.round(ageMinutes * 60)}s ago — cron is healthy.`;
    } else if (ageMinutes < 10) {
      cronStatus = 'warn';
      cronDetail = `Last heartbeat ${Math.round(ageMinutes)}m ago — may be delayed.`;
    } else {
      cronStatus = 'fail';
      cronDetail = `Last heartbeat ${Math.round(ageMinutes)}m ago — cron appears stopped.`;
    }
  }
  checks.push({
    label: 'SLA Cron Heartbeat',
    detail: cronDetail,
    status: cronStatus,
    remedy: 'Verify your external cron (cron-job.org or vercel.json) is hitting /api/cron/sla every minute with the correct CRON_SECRET.',
  });

  // 4. N8N_WEBHOOK_URL
  const hasWebhookUrl = !!process.env.N8N_WEBHOOK_URL;
  checks.push({
    label: 'N8N_WEBHOOK_URL',
    detail: hasWebhookUrl
      ? 'N8N_WEBHOOK_URL is set. Lead intake orchestration will fire.'
      : 'N8N_WEBHOOK_URL is missing. Lead intake webhooks will be silently skipped.',
    status: hasWebhookUrl ? 'pass' : 'fail',
    remedy: 'Add N8N_WEBHOOK_URL to your deployment environment variables.',
  });

  // 5. N8N_WEBHOOK_SECRET
  const hasWebhookSecret = !!process.env.N8N_WEBHOOK_SECRET;
  checks.push({
    label: 'N8N_WEBHOOK_SECRET',
    detail: hasWebhookSecret
      ? 'N8N_WEBHOOK_SECRET is set. HMAC callback verification is active.'
      : 'N8N_WEBHOOK_SECRET is not set. /api/orchestration/complete is unauthenticated.',
    status: hasWebhookSecret ? 'pass' : 'warn',
    remedy: 'Set N8N_WEBHOOK_SECRET in your env and configure the same secret in your n8n callback node.',
  });

  // 6. CRON_SECRET
  const hasCronSecret = !!process.env.CRON_SECRET;
  const isProduction = process.env.NODE_ENV === 'production';
  checks.push({
    label: 'CRON_SECRET',
    detail: hasCronSecret
      ? 'CRON_SECRET is set. Cron endpoint is protected.'
      : isProduction
      ? 'CRON_SECRET is missing in production. Cron endpoint returns 401 — SLA checks are NOT running!'
      : 'CRON_SECRET is not set (development mode). Cron endpoint is open for local testing.',
    status: hasCronSecret ? 'pass' : isProduction ? 'fail' : 'warn',
    remedy: 'Set CRON_SECRET in your deployment env and include the same value as the Authorization Bearer token in your cron job config.',
  });

  // 7. Most recent successful automation event
  const { data: lastSuccess } = await supabase
    .from('automation_events')
    .select('created_at')
    .eq('status', 'Success')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  let pipelineStatus: CheckStatus = 'warn';
  let pipelineDetail = 'No successful automation events recorded yet. Submit a test lead to verify the full loop.';
  if (lastSuccess?.created_at) {
    const ageHours = (Date.now() - new Date(lastSuccess.created_at).getTime()) / 3600000;
    pipelineStatus = 'pass';
    pipelineDetail = `Last successful webhook delivery: ${ageHours < 1 ? `${Math.round(ageHours * 60)}m` : `${ageHours.toFixed(1)}h`} ago.`;
  }
  checks.push({
    label: 'End-to-End Pipeline',
    detail: pipelineDetail,
    status: pipelineStatus,
    remedy: 'Submit a lead at /submit and verify the n8n callback fires successfully. The status should flip to PASS within 60 seconds.',
  });

  const failCount = checks.filter(c => c.status === 'fail').length;
  const warnCount = checks.filter(c => c.status === 'warn').length;
  const overallStatus: CheckStatus = failCount > 0 ? 'fail' : warnCount > 0 ? 'warn' : 'pass';

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-2xl">
      {/* Header */}
      <div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-[10px] font-bold text-zinc-500 uppercase tracking-widest hover:text-zinc-300 transition-colors mb-3"
        >
          <ArrowLeft className="h-3 w-3" />
          Command Center
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-4xl font-black tracking-tight uppercase leading-none italic">
            Setup <span className="text-muted-foreground">Check</span>
          </h1>
          <StatusBadge status={overallStatus} />
        </div>
        <p className="text-sm text-zinc-400 mt-2">
          Deployment readiness validation. Run this after every new client setup or env change.
        </p>
      </div>

      {/* Summary bar */}
      <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${
        overallStatus === 'pass'
          ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400'
          : overallStatus === 'fail'
          ? 'bg-red-500/5 border-red-500/20 text-red-400'
          : 'bg-yellow-500/5 border-yellow-500/20 text-yellow-400'
      }`}>
        <ShieldCheck className="w-4 h-4 shrink-0" />
        <span className="text-[11px] font-bold uppercase tracking-widest">
          {failCount > 0
            ? `${failCount} critical failure${failCount > 1 ? 's' : ''} — do not deploy to clients`
            : warnCount > 0
            ? `${warnCount} warning${warnCount > 1 ? 's' : ''} — review before client handoff`
            : 'All systems nominal — ready for client deployment'}
        </span>
      </div>

      {/* Check list */}
      <div className="bg-[#111111] border border-[#262626] rounded-lg overflow-hidden divide-y divide-[#262626]">
        {checks.map((check, i) => (
          <div key={i} className="px-5 py-4 flex items-start gap-3">
            <div className="mt-0.5">
              <StatusIcon status={check.status} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-bold text-[#FAFAFA]">{check.label}</span>
                <StatusBadge status={check.status} />
              </div>
              <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">{check.detail}</p>
              {check.status !== 'pass' && check.remedy && (
                <p className="text-[10px] text-zinc-600 mt-2 font-mono leading-relaxed border-t border-[#1f1f1f] pt-2">
                  → {check.remedy}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-zinc-700 font-mono text-center">
        ADMIN-only · Refreshes on every page load · LeadVelox Setup Check
      </p>
    </div>
  );
}
