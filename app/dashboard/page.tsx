import { getLeads } from '@/app/actions/leads';
import CommandCenter from '@/components/CommandCenter';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const leads = await getLeads();

  return (
    <>
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
    </>
  );
}
