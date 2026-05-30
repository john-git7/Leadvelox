import { getLeads } from '@/app/actions/leads';
import CommandCenter from '@/components/CommandCenter';

export const dynamic = 'force-dynamic';

export default async function DashboardPage(props: { searchParams?: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const searchParams = await props.searchParams;
  const p = typeof searchParams?.page === 'string' ? parseInt(searchParams.page, 10) : 0;
  const search = typeof searchParams?.search === 'string' ? searchParams.search : '';
  const statusFilter = typeof searchParams?.statusFilter === 'string' ? searchParams.statusFilter : 'All';
  const startDate = typeof searchParams?.startDate === 'string' ? searchParams.startDate : '';
  const endDate = typeof searchParams?.endDate === 'string' ? searchParams.endDate : '';

  const { leads: initialLeads, totalCount: initialTotalCount, currentUserRole, currentUserId } = await getLeads({ 
    page: p, 
    pageSize: 20,
    search,
    statusFilter,
    startDate,
    endDate
  });
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
        <CommandCenter initialLeads={initialLeads} initialTotalCount={initialTotalCount} currentUserRole={currentUserRole as any} currentUserId={currentUserId as string} />
      </main>
    </>
  );
}
