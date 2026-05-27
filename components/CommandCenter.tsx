'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import LeadDashboard from './LeadDashboard';
import OperationalTimeline from './OperationalTimeline';
import AutomationHealth from './AutomationHealth';
import IntegrationIndicators from './IntegrationIndicators';
import RevenueRisk from './RevenueRisk';
import DuplicateReview from './DuplicateReview';
import {
  getLeadEvents,
  getAutomationHealth,
  getSystemSettings,
  toggleBusinessHours,
  getLeads,
  getLeadStats,
  getAgents,
} from '@/app/actions/leads';
import { getSystemHealthMetrics } from '@/app/actions/health';
import { AlertCircle, Zap, Activity, ShieldAlert, BarChart3, Settings2 } from 'lucide-react';
import { toast } from 'sonner';

const PAGE_SIZE = 20;

type LeadStats = {
  total: number;
  hot: number;
  highRisk: number;
  duplicates: number;
  uncontacted: number;
};

type DashboardLead = {
  id: string;
  name: string;
  email: string;
  phone: string;
  source: string;
  status: string;
  urgency_score: number;
  decay_status: 'HOT' | 'WARM' | 'COLD' | 'HIGH_RISK';
  is_duplicate: boolean;
  response_deadline: string | null;
  sla_status: 'HEALTHY' | 'WARNING' | 'BREACHED';
  sla_breached_at: string | null;
  created_at: string;
  escalation_level?: number;
  last_acknowledged_at?: string | null;
  last_contacted_at?: string | null;
  assigned_agent_id?: string | null;
  delete_requested?: boolean;
};

export type Agent = {
  id: string;
  email: string;
  role: string;
};

type LeadEvent = {
  id: string;
  event_type: string;
  description: string;
  severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  created_at: string;
};

type HealthEvent = {
  id: string;
  workflow_name: string;
  status: 'Success' | 'Failed' | 'Retrying' | 'Pending';
  duration_ms?: number;
  error_message?: string;
  created_at: string;
};

type SystemSettings = {
  enforce_business_hours: boolean;
  avg_deal_value?: number;
};

interface CommandCenterProps {
  initialLeads: DashboardLead[];
  initialTotalCount: number;
  currentUserRole: 'ADMIN' | 'MANAGER' | 'AGENT';
}

export default function CommandCenter({ initialLeads, initialTotalCount, currentUserRole }: CommandCenterProps) {
  // --- Lead queue state (server-side paginated) ---
  const [leads, setLeads] = useState<DashboardLead[]>(initialLeads);
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // --- Agent list (for assignment dropdown) ---
  const [agents, setAgents] = useState<Agent[]>([]);

  // --- UI state ---
  const [selectedLead, setSelectedLead] = useState<DashboardLead | null>(null);
  const [events, setEvents] = useState<LeadEvent[]>([]);
  const [healthEvents, setHealthEvents] = useState<HealthEvent[]>([]);
  const [enforceBusinessHours, setEnforceBusinessHours] = useState(true);
  const [isToggling, setIsToggling] = useState(false);
  const [workflowHealthPct, setWorkflowHealthPct] = useState<string | null>(null);
  const [workflowHealthLabel, setWorkflowHealthLabel] = useState<string | null>(null);
  const [dbStatus, setDbStatus] = useState<string>('UP');
  const [avgDealValue, setAvgDealValue] = useState(1200);
  const [stats, setStats] = useState<LeadStats>({
    total: initialTotalCount,
    hot: initialLeads.filter(l => l.decay_status === 'HOT').length,
    highRisk: initialLeads.filter(l => l.decay_status === 'HIGH_RISK' || l.sla_status === 'BREACHED').length,
    duplicates: initialLeads.filter(l => l.is_duplicate).length,
    uncontacted: initialLeads.filter(l => l.status === 'New Lead').length,
  });

  const estimatedLoss = stats.highRisk * avgDealValue;

  // ------------------------------------------------------------
  // Server-side fetch — always respects current page/search/filter
  // ------------------------------------------------------------
  const fetchLeadsPage = useCallback(async (p: number, s: string, status: string, start: string, end: string) => {
    try {
      const { leads: newLeads, totalCount: newTotal } = await getLeads({ page: p, pageSize: PAGE_SIZE, search: s, statusFilter: status, startDate: start, endDate: end });
      setLeads(newLeads as DashboardLead[]);
      setTotalCount(newTotal);
    } catch { /* silent */ }
  }, []);

  const handleSearchChange = useCallback((newSearch: string) => {
    setSearch(newSearch);
    setPage(0);
    fetchLeadsPage(0, newSearch, statusFilter, startDate, endDate);
  }, [statusFilter, fetchLeadsPage, startDate, endDate]);

  const handleStatusFilterChange = useCallback((newFilter: string) => {
    setStatusFilter(newFilter);
    setPage(0);
    fetchLeadsPage(0, search, newFilter, startDate, endDate);
  }, [search, fetchLeadsPage, startDate, endDate]);

  const handleDateFilterChange = useCallback((start: string, end: string) => {
    setStartDate(start);
    setEndDate(end);
    setPage(0);
    fetchLeadsPage(0, search, statusFilter, start, end);
  }, [search, statusFilter, fetchLeadsPage]);

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
    fetchLeadsPage(newPage, search, statusFilter, startDate, endDate);
  }, [search, statusFilter, fetchLeadsPage, startDate, endDate]);

  // ------------------------------------------------------------
  // Health + settings
  // ------------------------------------------------------------
  const loadHealthAndSettings = useCallback(async () => {
    const [health, settings, metrics] = await Promise.all([
      getAutomationHealth(),
      getSystemSettings(),
      getSystemHealthMetrics(),
    ]);
    setHealthEvents(health as HealthEvent[]);
    const systemSettings = settings as SystemSettings;
    setEnforceBusinessHours(systemSettings.enforce_business_hours);
    setAvgDealValue(systemSettings.avg_deal_value ?? 1200);
    setWorkflowHealthPct(`${metrics.successRatio}%`);
    if (metrics.stuckPendingCount > 0) {
      setWorkflowHealthLabel(`${metrics.stuckPendingCount} stuck`);
    } else if (metrics.retryCount > 0) {
      setWorkflowHealthLabel(`${metrics.retryCount} retrying`);
    } else if (metrics.pendingCount > 0) {
      setWorkflowHealthLabel(`${metrics.pendingCount} pending`);
    } else {
      setWorkflowHealthLabel(`${metrics.successRatio}%`);
    }
    setDbStatus(metrics.dbStatus || 'UP');
  }, []);

  const loadStats = useCallback(async () => {
    const s = await getLeadStats();
    setStats(s);
  }, []);

  // ------------------------------------------------------------
  // Realtime silent refresh — captures latest filter values via ref pattern
  // ------------------------------------------------------------
  const silentRefreshRef = useRef<(() => void) | null>(null);
  const filterRef = useRef({ page, search, statusFilter, startDate, endDate });
  filterRef.current = { page, search, statusFilter, startDate, endDate };

  silentRefreshRef.current = async () => {
    try {
      const { page: p, search: s, statusFilter: sf, startDate: sd, endDate: ed } = filterRef.current;
      const [{ leads: newLeads, totalCount: newTotal }, newStats] = await Promise.all([
        getLeads({ page: p, pageSize: PAGE_SIZE, search: s, statusFilter: sf, startDate: sd, endDate: ed }),
        getLeadStats(),
      ]);
      setLeads(newLeads as DashboardLead[]);
      setTotalCount(newTotal);
      setStats(newStats);
      await loadHealthAndSettings();
      if (selectedLead) {
        getLeadEvents(selectedLead.id).then(setEvents);
      }
    } catch { /* silent */ }
  };

  useEffect(() => {
    queueMicrotask(() => {
      void loadHealthAndSettings();
      void loadStats();
      // Load agents for the assignment dropdown
      getAgents().then(setAgents);
    });

    const supabase = createClient();
    const channel = supabase.channel('dashboard-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
        silentRefreshRef.current?.();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'automation_events' }, () => {
        silentRefreshRef.current?.();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lead_events' }, () => {
        silentRefreshRef.current?.();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadHealthAndSettings, loadStats]);

  useEffect(() => {
    if (selectedLead) {
      getLeadEvents(selectedLead.id).then(setEvents);
    }
  }, [selectedLead]);

  const handleToggleBusinessHours = async () => {
    setIsToggling(true);
    const newVal = !enforceBusinessHours;
    const res = await toggleBusinessHours(newVal);
    if (res.success) {
      setEnforceBusinessHours(newVal);
      toast.success(`Business Hours SLA ${newVal ? 'Enabled' : 'Disabled'}`);
    } else {
      toast.error(res.error || 'Failed to update system settings');
    }
    setIsToggling(false);
  };

  const metricCards = [
    { id: 'escalations', label: 'SLA Breaches', value: stats.highRisk, icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-500/10' },
    { id: 'hot', label: 'Active Hot Leads', value: stats.hot, icon: Zap, color: 'text-orange-500', bg: 'bg-orange-500/10' },
    { id: 'duplicates', label: 'Network Duplicates', value: stats.duplicates, icon: ShieldAlert, color: 'text-blue-400', bg: 'bg-blue-400/10' },
    { id: 'uncontacted', label: 'Unresponded Leads', value: stats.uncontacted, icon: Activity, color: 'text-[#FAFAFA]', bg: 'bg-[#171717]' },
    {
      id: 'health',
      label: 'Workflow Health',
      value: workflowHealthLabel ?? workflowHealthPct ?? '—',
      icon: BarChart3,
      color: workflowHealthLabel?.includes('stuck') || (workflowHealthPct && parseFloat(workflowHealthPct) < 90) ? 'text-yellow-500' : 'text-green-500',
      bg: workflowHealthLabel?.includes('stuck') || (workflowHealthPct && parseFloat(workflowHealthPct) < 90) ? 'bg-yellow-500/10' : 'bg-green-500/10',
    },
  ];

  return (
    <div className="space-y-8">
      {/* HEADER CONTROLS STRIP */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 px-4 py-2.5 bg-[#111111] border border-[#262626] rounded-md shadow-sm">
          <Activity className="w-4 h-4 text-muted-foreground" />
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-[#FAFAFA] uppercase tracking-wider leading-none">DB Connection</span>
            <span className={`text-[9px] font-mono mt-0.5 ${dbStatus === 'UP' ? 'text-green-500' : 'text-red-500'}`}>
              {dbStatus === 'UP' ? 'STABLE' : 'DEGRADED'}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          <div className="flex items-center gap-3 px-4 py-2.5 bg-[#111111] border border-[#262626] rounded-md shadow-sm">
            <Settings2 className="w-4 h-4 text-muted-foreground" />
            <div className="flex flex-col items-end mr-2">
              <span className="text-[10px] font-bold text-[#FAFAFA] uppercase tracking-wider leading-none">Business Hours SLA</span>
              <span className="text-[9px] font-mono text-muted-foreground mt-0.5">
                {enforceBusinessHours ? 'ACTIVE (9AM–5PM ET)' : 'DISABLED (24/7 MODE)'}
              </span>
            </div>
            <button
              onClick={handleToggleBusinessHours}
              disabled={isToggling}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${enforceBusinessHours ? 'bg-green-500' : 'bg-[#262626]'} ${isToggling ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${enforceBusinessHours ? 'translate-x-5' : 'translate-x-1'}`} />
            </button>
          </div>
        </div>
      </div>

      {/* 1. OPERATIONAL METRICS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {metricCards.map((stat, i) => (
          <div
            key={i}
            className="p-4 rounded-lg bg-[#111111] border border-[#262626] flex flex-col gap-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{stat.label}</span>
              <div className={`p-1.5 rounded ${stat.bg}`}>
                <stat.icon className={`w-3.5 h-3.5 ${stat.color}`} />
              </div>
            </div>
            <span className={`text-2xl font-black tracking-tighter ${stat.color}`}>{stat.value}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-12 gap-6 items-start">
        {/* 2. PRIORITY QUEUE (8 Columns) */}
        <div className="col-span-12 lg:col-span-8 space-y-8">
          <div className="flex items-center justify-between px-2 border-b border-[#262626] pb-2">
            <h2 className="text-[12px] font-black text-[#FAFAFA] uppercase tracking-[0.2em]">Workflow Orchestration</h2>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[10px] font-mono text-green-500 font-bold uppercase">Live Sync Active</span>
            </div>
          </div>

          <DuplicateReview />

          <div className="space-y-3">
            <div className="px-2">
              <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                Main Active Queue
              </h3>
            </div>
            <div className="bg-[#0A0A0A] border border-[#262626] rounded-lg shadow-sm overflow-hidden flex flex-col h-[600px]">
              <LeadDashboard
                leads={leads}
                totalCount={totalCount}
                page={page}
                pageSize={PAGE_SIZE}
                search={search}
                statusFilter={statusFilter}
                startDate={startDate}
                endDate={endDate}
                agents={agents}
                currentUserRole={currentUserRole}
                onLeadsChange={setLeads}
                onLeadSelect={setSelectedLead}
                selectedLeadId={selectedLead?.id}
                onSearchChange={handleSearchChange}
                onStatusFilterChange={handleStatusFilterChange}
                onDateFilterChange={handleDateFilterChange}
                onPageChange={handlePageChange}
              />
            </div>
          </div>
        </div>

        {/* 3. OPERATIONAL INTELLIGENCE (4 Columns) */}
        <div className="col-span-12 lg:col-span-4 space-y-6 lg:sticky lg:top-8">
          <RevenueRisk atRiskCount={stats.highRisk} estimatedLoss={estimatedLoss} avgDealValue={avgDealValue} />
          <IntegrationIndicators />
          <AutomationHealth events={healthEvents} />

          {selectedLead ? (
            <div className="bg-[#111111] border border-[#262626] rounded-lg p-6 space-y-6 shadow-2xl">
              <div className="flex flex-col gap-1 pb-4 border-b border-[#262626]">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Active Operational Context</span>
                <h3 className="text-xl font-bold text-[#FAFAFA] tracking-tight">{selectedLead.name}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] font-mono text-muted-foreground truncate max-w-[200px]">{selectedLead.id}</span>
                  <div className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${selectedLead.is_duplicate ? 'bg-red-500/10 border-red-500/20 text-red-500' : 'bg-green-500/10 border-green-500/20 text-green-500'}`}>
                    {selectedLead.is_duplicate ? 'REPEATED' : 'UNIQUE'}
                  </div>
                </div>
              </div>
              <OperationalTimeline events={events} />
            </div>
          ) : (
            <div className="bg-[#111111] border border-[#262626] border-dashed rounded-lg p-12 flex items-center justify-center text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest leading-loose font-bold">
                SELECT A LEAD TO LOAD <br />
                OPERATIONAL EVENT TIMELINE
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
