'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import LeadDashboard from './LeadDashboard';
import OperationalTimeline from './OperationalTimeline';
import AutomationHealth from './AutomationHealth';
import AutomationEventModal from './AutomationEventModal';
import IntegrationIndicators from './IntegrationIndicators';
import RevenueRisk from './RevenueRisk';
import DuplicateReview from './DuplicateReview';
import LeadDetailModal from './LeadDetailModal';
import {
  getLeadEvents,
  getAutomationHealth,
  getSystemSettings,
  toggleBusinessHours,
  getLeads,
  getLeadStats,
  getAgents,
  getLead,
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
  escalation_level: number;
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
  lead_id?: string;
};

type SystemSettings = {
  enforce_business_hours: boolean;
  avg_deal_value?: number;
};

function NextEscalationTimer({ lead }: { lead: DashboardLead }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (!lead.response_deadline || lead.status !== 'New Lead') return null;

  const thresholds = [
    { level: 1, delay: 0 },
    { level: 2, delay: 5 },
    { level: 3, delay: 15 },
    { level: 4, delay: 60 }
  ];

  const currentLevel = lead.escalation_level ?? 0;
  if (currentLevel >= 4) {
    return (
      <div className="text-right flex flex-col items-end justify-center">
        <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest">Max Escalation</span>
        <div className="text-sm font-black text-red-500 mt-1">LEVEL 4</div>
      </div>
    );
  }

  const nextThreshold = thresholds.find(t => t.level === currentLevel + 1);
  if (!nextThreshold) return null;

  const deadlineMs = new Date(lead.response_deadline).getTime();
  const escalationTimeMs = deadlineMs + (nextThreshold.delay * 60000);
  const diffMs = escalationTimeMs - now;

  const isProcessing = diffMs <= 0;

  const formatTime = (ms: number) => {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}m ${s}s`;
  };

  return (
    <div className="text-right flex flex-col items-end justify-center" suppressHydrationWarning>
      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
        Next Escalation (L{nextThreshold.level})
      </span>
      <div className={`text-lg font-black ${isProcessing ? 'text-red-500' : 'text-yellow-500'} font-mono leading-none mt-1`}>
        {isProcessing ? 'PROCESSING...' : formatTime(diffMs)}
      </div>
    </div>
  );
}

interface CommandCenterProps {
  initialLeads: DashboardLead[];
  initialTotalCount: number;
  currentUserRole: 'ADMIN' | 'MANAGER' | 'AGENT';
  currentUserId: string;
}

export default function CommandCenter({ initialLeads, initialTotalCount, currentUserRole, currentUserId }: CommandCenterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // --- Lead queue state (server-side paginated) ---
  const [leads, setLeads] = useState<DashboardLead[]>(initialLeads);
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [page, setPage] = useState(() => Number(searchParams.get('page')) || 0);
  const [search, setSearch] = useState(() => searchParams.get('search') || '');
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get('statusFilter') || 'All');
  const [startDate, setStartDate] = useState(() => searchParams.get('startDate') || '');
  const [endDate, setEndDate] = useState(() => searchParams.get('endDate') || '');

  const updateUrl = useCallback((p: number, s: string, sf: string, start: string, end: string) => {
    const params = new URLSearchParams();
    if (p > 0) params.set('page', p.toString());
    if (s) params.set('search', s);
    if (sf && sf !== 'All') params.set('statusFilter', sf);
    if (start) params.set('startDate', start);
    if (end) params.set('endDate', end);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [pathname, router]);

  // --- Agent list (for assignment dropdown) ---
  const [agents, setAgents] = useState<Agent[]>([]);

  // --- UI state ---
  const [selectedLead, setSelectedLead] = useState<DashboardLead | null>(null);
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [events, setEvents] = useState<LeadEvent[]>([]);
  const [healthEvents, setHealthEvents] = useState<HealthEvent[]>([]);
  const [enforceBusinessHours, setEnforceBusinessHours] = useState(true);
  const [isToggling, setIsToggling] = useState(false);
  const [workflowHealthPct, setWorkflowHealthPct] = useState<string | null>(null);
  const [workflowHealthLabel, setWorkflowHealthLabel] = useState<string | null>(null);
  const [dbStatus, setDbStatus] = useState<string>('UP');
  const [realtimeStatus, setRealtimeStatus] = useState<'connecting' | 'live' | 'error'>('connecting');
  const [avgDealValue, setAvgDealValue] = useState(1200);
  const [stats, setStats] = useState<LeadStats | null>(null);

  const estimatedLoss = stats ? stats.highRisk * avgDealValue : 0;

  const handleSelectLeadById = useCallback(async (leadId: string) => {
    console.log('[handleSelectLeadById] Triggered with leadId:', leadId);
    // 1. Search locally in our active page list of leads
    const found = leads.find((l) => l.id === leadId);
    if (found) {
      console.log('[handleSelectLeadById] Found lead locally:', found.name);
      setSelectedLead(found);
      return;
    }

    console.log('[handleSelectLeadById] Lead not found locally. Fetching from server...');
    // 2. Fetch from the database if not found locally
    try {
      const fetched = await getLead(leadId);
      if (fetched) {
        console.log('[handleSelectLeadById] Fetched lead from server:', fetched.name);
        setSelectedLead(fetched as any);
      } else {
        console.warn('[handleSelectLeadById] Lead not found on server or access denied.');
        toast.error('Lead not found or access denied');
      }
    } catch (err) {
      console.error('[handleSelectLeadById] Failed to fetch lead:', err);
      toast.error('Error fetching lead details');
    }
  }, [leads]);

  // ------------------------------------------------------------
  // Server-side fetch — always respects current page/search/filter
  // ------------------------------------------------------------
  const fetchLeadsPage = useCallback(async (p: number, s: string, status: string, start: string, end: string) => {
    try {
      const { leads: newLeads, totalCount: newTotal } = await getLeads({ 
        page: p, 
        pageSize: PAGE_SIZE, 
        search: s, 
        statusFilter: status, 
        startDate: start, 
        endDate: end,
        timezoneOffset: new Date().getTimezoneOffset()
      });
      setLeads(newLeads as DashboardLead[]);
      setTotalCount(newTotal);
    } catch { /* silent */ }
  }, []);

  const handleSearchChange = useCallback((newSearch: string) => {
    setSearch(newSearch);
    setPage(0);
    updateUrl(0, newSearch, statusFilter, startDate, endDate);
    fetchLeadsPage(0, newSearch, statusFilter, startDate, endDate);
  }, [statusFilter, fetchLeadsPage, startDate, endDate, updateUrl]);

  const handleStatusFilterChange = useCallback((newFilter: string) => {
    setStatusFilter(newFilter);
    setPage(0);
    updateUrl(0, search, newFilter, startDate, endDate);
    fetchLeadsPage(0, search, newFilter, startDate, endDate);
  }, [search, fetchLeadsPage, startDate, endDate, updateUrl]);

  const handleDateFilterChange = useCallback((start: string, end: string) => {
    setStartDate(start);
    setEndDate(end);
    setPage(0);
    updateUrl(0, search, statusFilter, start, end);
    fetchLeadsPage(0, search, statusFilter, start, end);
  }, [search, statusFilter, fetchLeadsPage, updateUrl]);

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
    updateUrl(newPage, search, statusFilter, startDate, endDate);
    fetchLeadsPage(newPage, search, statusFilter, startDate, endDate);
  }, [search, statusFilter, fetchLeadsPage, startDate, endDate, updateUrl]);

  // ------------------------------------------------------------
  // Health + settings
  // ------------------------------------------------------------
  const loadHealthAndSettings = useCallback(async () => {
    const [health, settings, metrics] = await Promise.all([
      getAutomationHealth(),
      getSystemSettings(),
      getSystemHealthMetrics(),
    ]);
    setHealthEvents(health as unknown as HealthEvent[]);
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
        getLeads({ 
          page: p, 
          pageSize: PAGE_SIZE, 
          search: s, 
          statusFilter: sf, 
          startDate: sd, 
          endDate: ed,
          timezoneOffset: new Date().getTimezoneOffset()
        }),
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

    const playUrgentBeep = () => {
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'square';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
        
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.type = 'square';
        osc2.frequency.setValueAtTime(880, ctx.currentTime + 0.25);
        gain2.gain.setValueAtTime(0.1, ctx.currentTime + 0.25);
        osc2.start(ctx.currentTime + 0.25);
        osc2.stop(ctx.currentTime + 0.4);
      } catch (e) { /* audio blocked */ }
    };

    const supabase = createClient();
    const channel = supabase.channel('dashboard-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, (payload) => {
        if (payload.eventType === 'UPDATE') {
          const oldLead = payload.old;
          const newLead = payload.new;
          if (newLead.escalation_level >= 1 && (oldLead.escalation_level || 0) < 1 && newLead.assigned_agent_id === null) {
            playUrgentBeep();
            toast.error(`🚨 SLA WARNING: '${newLead.name}' has been unclaimed for 5 minutes! Claim now!`, {
              duration: 10000,
              style: { background: '#ef4444', color: '#fff', fontWeight: 'bold' }
            });
          }
        }
        silentRefreshRef.current?.();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'automation_events' }, () => {
        silentRefreshRef.current?.();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lead_events' }, () => {
        silentRefreshRef.current?.();
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setRealtimeStatus('live');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setRealtimeStatus('error');
        } else if (status === 'CLOSED') {
          setRealtimeStatus('connecting');
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadHealthAndSettings, loadStats]);

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
    { id: 'escalations', label: 'SLA Breaches', value: stats?.highRisk ?? '—', icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-500/10' },
    { id: 'hot', label: 'Active Hot Leads', value: stats?.hot ?? '—', icon: Zap, color: 'text-orange-500', bg: 'bg-orange-500/10' },
    { id: 'duplicates', label: 'Network Duplicates', value: stats?.duplicates ?? '—', icon: ShieldAlert, color: 'text-blue-400', bg: 'bg-blue-400/10' },
    { id: 'uncontacted', label: 'Unresponded Leads', value: stats?.uncontacted ?? '—', icon: Activity, color: 'text-[#FAFAFA]', bg: 'bg-[#171717]' },
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
          {currentUserRole !== 'AGENT' && (
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
          )}
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
            {stat.value === '—' ? (
              <span className="text-xl font-bold tracking-tighter text-zinc-600 animate-pulse">Loading…</span>
            ) : (
              <span className={`text-2xl font-black tracking-tighter ${stat.color}`}>{stat.value}</span>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-12 gap-6 items-stretch">
        {/* 2. PRIORITY QUEUE (8 Columns) */}
        <div className="col-span-12 lg:col-span-8 flex flex-col gap-8">
          <div className="flex items-center justify-between px-2 border-b border-[#262626] pb-2">
            <h2 className="text-[12px] font-black text-[#FAFAFA] uppercase tracking-[0.2em]">Workflow Orchestration</h2>
            <div className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full transition-colors ${
                realtimeStatus === 'live' ? 'bg-green-500 animate-pulse' :
                realtimeStatus === 'error' ? 'bg-red-500 animate-pulse' :
                'bg-yellow-500 animate-pulse'
              }`} />
              <span className={`text-[10px] font-mono font-bold uppercase ${
                realtimeStatus === 'live' ? 'text-green-500' :
                realtimeStatus === 'error' ? 'text-red-500' :
                'text-yellow-500'
              }`}>
                {realtimeStatus === 'live' ? 'Live Sync Active' :
                 realtimeStatus === 'error' ? 'Sync Error' :
                 'Connecting...'}
              </span>
            </div>
          </div>

          <DuplicateReview />

          <div className="flex flex-col flex-1 gap-3">
            <div className="px-2 shrink-0">
              <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                Main Active Queue
              </h3>
            </div>
            <div className="bg-[#0A0A0A] border border-[#262626] rounded-lg shadow-sm overflow-hidden flex flex-col flex-1 min-h-[600px]">
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
                currentUserId={currentUserId}
                onLeadsChange={setLeads}
                onLeadSelect={(lead) => {
                  setSelectedLead(lead);
                  setIsLeadModalOpen(true);
                }}
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
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">
          <div className="shrink-0">
            <RevenueRisk atRiskCount={stats?.highRisk ?? 0} estimatedLoss={estimatedLoss} avgDealValue={avgDealValue} />
          </div>
          <div className="shrink-0">
            <IntegrationIndicators />
          </div>
          <div className="flex-1 flex flex-col min-h-[400px]">
            <AutomationHealth
              events={healthEvents}
              onEventSelect={(evt) => {
                setSelectedEvent(evt);
                setIsEventModalOpen(true);
              }}
            />
          </div>

        </div>
      </div>
      <AutomationEventModal
        event={selectedEvent}
        open={isEventModalOpen}
        onOpenChange={setIsEventModalOpen}
        onSelectLead={(id) => { handleSelectLeadById(id); setIsLeadModalOpen(true); }}
      />
      <LeadDetailModal
        lead={selectedLead as any}
        open={isLeadModalOpen}
        onOpenChange={setIsLeadModalOpen}
        agents={agents}
      />
    </div>
  );
}
