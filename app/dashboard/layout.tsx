import { logout } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import SLABreachBanner from '@/components/SLABreachBanner';
import { LogOut, Activity } from 'lucide-react';
import { Suspense } from 'react';

/**
 * Dashboard Layout
 *
 * Shared chrome for all /dashboard/* routes:
 * - Operational top nav with System Health link
 * - Global SLA breach alert banner (server-rendered, zero cost when clean)
 * - Children slot
 *
 * This layout was extracted from dashboard/page.tsx so that sub-routes like
 * /dashboard/system-health share the same nav and alert bar automatically.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#FAFAFA]">
      {/* GLOBAL SYSTEM HEADER */}
      <div className="border-b border-[#262626] bg-[#0A0A0A] px-8 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <a href="/dashboard" className="flex items-center gap-2">
            <div className="w-5 h-5 bg-[#FAFAFA] rounded-sm flex items-center justify-center">
              <div className="w-2.5 h-2.5 bg-[#0A0A0A] rounded-full" />
            </div>
            <span className="text-sm font-bold tracking-tighter">LEAD OPS / INTEL</span>
          </a>
          <nav className="hidden md:flex items-center gap-4 text-[10px] font-bold text-muted-foreground tracking-widest uppercase">
            <a
              href="/dashboard/system-health"
              className="flex items-center gap-1 text-blue-500 hover:text-blue-400 transition-colors"
            >
              <Activity className="w-3 h-3" />
              System Health
            </a>
          </nav>
        </div>

        <form action={logout}>
          <Button
            variant="ghost"
            type="submit"
            className="h-8 text-[11px] font-bold text-muted-foreground hover:text-[#FAFAFA] hover:bg-[#111111]"
          >
            <LogOut className="w-3.5 h-3.5 mr-2" />
            TERMINATE SESSION
          </Button>
        </form>
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
