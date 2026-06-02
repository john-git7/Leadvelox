import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { LogoutButton } from '@/components/LogoutButton';
import { Logo } from '@/components/Logo';
import SLABreachBanner from '@/components/SLABreachBanner';
import LivePresence from '@/components/LivePresence';
import { Activity, Settings, ShieldCheck } from 'lucide-react';
import { Suspense } from 'react';

/**
 * Dashboard Layout
 *
 * Shared chrome for all /dashboard/* routes:
 * - Server-side authentication guard — unauthenticated requests redirect to /login
 * - Operational top nav with System Health link
 * - Global SLA breach alert banner (server-rendered, zero cost when clean)
 * - Children slot
 *
 * This layout was extracted from dashboard/page.tsx so that sub-routes like
 * /dashboard/system-health share the same nav and alert bar automatically.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Auth guard — runs on every /dashboard/* request before any content renders.
  // Supabase validates the session server-side; an expired or missing cookie
  // returns null for user and triggers the redirect.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login');
  }

  // Fetch the user's role profile.
  // Edge case: if the handle_new_user trigger failed at signup (e.g. transient
  // DB error), the auth.users row exists but the profiles row does not.
  // Rather than locking the user out permanently, we self-heal by inserting a
  // default AGENT profile here. createAdminClient (service role) bypasses RLS.
  let { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();

  if (!profile) {
    const { createAdminClient } = await import('@/lib/supabase/server');
    const adminClient = await createAdminClient();
    // upsert is idempotent: inserts if missing, does nothing if already present.
    await adminClient
      .from('profiles')
      .upsert({ id: user.id, role: 'AGENT' }, { onConflict: 'id', ignoreDuplicates: true });
    // Re-fetch so the layout has the correct role going forward.
    const { data: repaired } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    profile = repaired;
  }

  const role = profile?.role || 'AGENT';
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#FAFAFA]">
      {/* GLOBAL SYSTEM HEADER */}
      <div className="border-b border-[#262626] bg-[#0A0A0A] px-8 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <a href="/dashboard" className="flex items-center gap-1">
            <Logo className="h-8 w-auto text-[#FAFAFA]" />
            <span className="text-sm font-bold tracking-tighter hidden sm:inline-block">LEADVELOX</span>
          </a>
          <nav className="flex items-center gap-3 md:gap-4 text-[10px] font-bold text-muted-foreground tracking-widest uppercase">
            <a
              href="/dashboard/system-health"
              className="flex items-center gap-1 text-blue-500 hover:text-blue-400 transition-colors"
            >
              <Activity className="w-3 h-3" />
              System Health
            </a>
            <a
              href="/dashboard/settings"
              className="flex items-center gap-1 text-muted-foreground hover:text-[#FAFAFA] transition-colors"
            >
              <Settings className="w-3 h-3" />
              Settings
            </a>
            {role === 'ADMIN' && (
              <a
                href="/dashboard/setup-check"
                className="flex items-center gap-1 text-zinc-600 hover:text-zinc-300 transition-colors"
                title="Deployment readiness check (ADMIN only)"
              >
                <ShieldCheck className="w-3 h-3" />
                Setup Check
              </a>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <LivePresence />
          {/* Server-rendered user identity — always accurate, no client JS needed */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-[#111111] border border-[#262626] rounded-full">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
            <span className="text-[10px] font-mono text-muted-foreground truncate max-w-[160px]" title={user.email ?? ''}>
              {(user.email ?? '').length > 22 ? `${(user.email ?? '').slice(0, 22)}…` : (user.email ?? '')}
            </span>
            <span className="text-[9px] font-bold text-[#FAFAFA] bg-[#262626] px-1.5 py-0.5 rounded-sm ml-1 uppercase tracking-widest">{role}</span>
          </div>
          <LogoutButton />
        </div>
      </div>

      {/* GLOBAL SLA BREACH BANNER — renders nothing when no breaches */}
      <Suspense fallback={null}>
        <SLABreachBanner />
      </Suspense>

      {/* PAGE CONTENT */}
      <div className="p-8">
        <div className="max-w-[1600px] mx-auto space-y-12">
          {children}
        </div>
      </div>
    </div>
  );
}
