import { logout } from '@/app/actions/auth';
import { getLeads } from '@/app/actions/leads';
import CommandCenter from '@/components/CommandCenter';
import { Button } from '@/components/ui/button';
import { LogOut, Radio, Activity } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const leads = await getLeads();

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#FAFAFA]">
      {/* GLOBAL SYSTEM HEADER */}
      <div className="border-b border-[#262626] bg-[#0A0A0A] px-8 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-[#FAFAFA] rounded-sm flex items-center justify-center">
              <div className="w-2.5 h-2.5 bg-[#0A0A0A] rounded-full" />
            </div>
            <span className="text-sm font-bold tracking-tighter">LEAD OPS / INTEL</span>
          </div>
          <div className="hidden md:flex items-center gap-4 text-[10px] font-bold text-muted-foreground tracking-widest uppercase">
            <a href="/dashboard/system-health" className="flex items-center gap-1 text-blue-500 hover:text-blue-400">
              <Activity className="w-3 h-3" /> System Health
            </a>
          </div>
        </div>

        <form action={logout}>
          <Button variant="ghost" type="submit" className="h-8 text-[11px] font-bold text-muted-foreground hover:text-[#FAFAFA] hover:bg-[#111111]">
            <LogOut className="w-3.5 h-3.5 mr-2" /> TERMINATE SESSION
          </Button>
        </form>
      </div>

      <div className="p-8">
        <div className="max-w-[1600px] mx-auto space-y-12">
          {/* PAGE TITLE & CONTEXT */}
          <header className="flex flex-col gap-2">
            <h1 className="text-4xl font-black tracking-tight uppercase leading-none italic">
              Command <span className="text-muted-foreground">Center</span>
            </h1>
            <p className="text-sm text-muted-foreground max-w-lg">
              Monitoring operational invariants, lead decay vectors, and workflow orchestration health in real-time.
            </p>
          </header>

          <main>
            <CommandCenter initialLeads={leads} />
          </main>
        </div>
      </div>
    </div>
  );
}
