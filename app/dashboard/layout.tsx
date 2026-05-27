import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { LogoutButton } from '@/components/LogoutButton';
import SLABreachBanner from '@/components/SLABreachBanner';
import LivePresence from '@/components/LivePresence';
import { Activity, Settings } from 'lucide-react';
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
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#FAFAFA]">
      {/* GLOBAL SYSTEM HEADER */}
      <div className="border-b border-[#262626] bg-[#0A0A0A] px-8 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <a href="/dashboard" className="flex items-center gap-2">
            <div className="w-5 h-5 bg-[#FAFAFA] rounded-sm flex items-center justify-center">
              <div className="w-2.5 h-2.5 bg-[#0A0A0A] rounded-full" />
            </div>
            <span className="text-sm font-bold tracking-tighter">LEADVELOX</span>
          </a>
          <nav className="hidden md:flex items-center gap-4 text-[10px] font-bold text-muted-foreground tracking-widest uppercase">
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
