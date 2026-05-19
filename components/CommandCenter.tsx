'use client';

import { useState, useEffect, useCallback } from 'react';
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
} from '@/app/actions/leads';
import { getSystemHealthMetrics } from '@/app/actions/health';
import { AlertCircle, Zap, Activity, ShieldAlert, BarChart3, Settings2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

const REFRESH_INTERVAL_MS = 30_000;

type LeadStats = {
  total: number;
  hot: number;
  highRisk: number;
  duplicates: number;
  uncontacted: number;
};

export default function CommandCenter({ initialLeads }: { initialLeads: any[] }) {
  const [leads, setLeads] = useState<any[]>(initialLeads);
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [healthEvents, setHealthEvents] = useState<any[]>([]);
  const [enforceBusinessHours, setEnforceBusinessHours] = useState(true);
  const [isToggling, setIsToggling] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [workflowHealthPct, setWorkflowHealthPct] = useState<string | null>(null);
  const [dbStatus, setDbStatus] = useState<string>('UP');
  const [avgDealValue, setAvgDealValue] = useState(1200);
  // Aggregate stats — not dependent on paginated leads list
  const [stats, setStats] = useState<LeadStats>({
    total: initialLeads.length,
    hot: initialLeads.filter(l => l.decay_status === 'HOT').length,
    highRisk: initialLeads.filter(l => l.decay_status === 'HIGH_RISK' || l.sla_status === 'BREACHED').length,
    duplicates: initialLeads.filter(l => l.is_duplicate).length,
    uncontacted: initialLeads.filter(l => l.status === 'New Lead').length,
  });

  const estimatedLoss = stats.highRisk * avgDealValue;

  const loadHealthAndSettings = useCallback(async () => {
    const [health, settings, metrics] = await Promise.all([
      getAutomationHealth(),
      getSystemSettings(),
      getSystemHealthMetrics(),
    ]);
    setHealthEvents(health);
    setEnforceBusinessHours(settings.enforce_business_hours);
    // avg_deal_value may not exist on older DB rows — fall back to 1200
    setAvgDealValue((settings as any).avg_deal_value ?? 1200);
    // Real computed workflow health from automation_events table
    setWorkflowHealthPct(`${metrics.successRatio}%`);
    setDbStatus(metrics.dbStatus || 'UP');
  }, []);

  const loadStats = useCallback(async () => {
    const s = await getLeadStats();
    setStats(s);
  }, []);

  useEffect(() => {
    loadHealthAndSettings();
    loadStats();
    const interval = setInterval(() => {
      loadHealthAndSettings();
      loadStats();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loadHealthAndSettings, loadStats]);

  const handleToggleBusinessHours = async () => {
    setIsToggling(true);
    const newVal = !enforceBusinessHours;
    const res = await toggleBusinessHours(newVal);
    if (res.success) {
      setEnforceBusinessHours(newVal);
      toast.success(`Business Hours SLA ${newVal ? 'Enabled' : 'Disabled'}`);
    } else {
      toast.error('Failed to update system settings');
    }
    setIsToggling(false);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const [newLeads, newStats] = await Promise.all([
        getLeads(0, 50),
        getLeadStats(),
      ]);
      setLeads(newLeads);
      setStats(newStats);
      await loadHealthAndSettings();

      if (selectedLead) {
        const leadEvents = await getLeadEvents(selectedLead.id);
        setEvents(leadEvents);
      }
      toast.success('Dashboard intel synchronized');
    } catch {
      toast.error('Failed to synchronize data');
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (selectedLead) {
      getLeadEvents(selectedLead.id).then(setEvents);
    }
  }, [selectedLead]);

  const metricCards = [
    { label: 'SLA Breaches', value: stats.highRisk, icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-500/10' },
    { label: 'Active Hot Leads', value: stats.hot, icon: Zap, color: 'text-orange-500', bg: 'bg-orange-500/10' },
    { label: 'Network Duplicates', value: stats.duplicates, icon: ShieldAlert, color: 'text-blue-400', bg: 'bg-blue-400/10' },
    { label: 'Unresponded Leads', value: stats.uncontacted, icon: Activity, color: 'text-[#FAFAFA]', bg: 'bg-[#171717]' },
    {
      label: 'Workflow Health',
      value: workflowHealthPct ?? '—',
      icon: BarChart3,
      color: workflowHealthPct && parseFloat(workflowHealthPct) < 90 ? 'text-yellow-500' : 'text-green-500',
      bg: workflowHealthPct && parseFloat(workflowHealthPct) < 90 ? 'bg-yellow-500/10' : 'bg-green-500/10',
    },
  ];

  return (
    <div className="space-y-8">
      {/* HEADER CONTROLS STRIP */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        {/* Real DB Status Indicator */}
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
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#111111] border border-[#262626] rounded-md shadow-sm hover:bg-[#171717] transition-colors text-muted-foreground hover:text-[#FAFAFA]"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#FAFAFA]' : ''}`} />
            <span className="text-[10px] font-bold uppercase tracking-wider leading-none">Refresh Intel</span>
          </button>

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
          <div key={i} className="p-4 rounded-lg bg-[#111111] border border-[#262626] flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{stat.label}</span>
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
        <div className="col-span-12 lg:col-span-8 space-y-6">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.2em]">Priority Lead Queue</h2>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[10px] font-mono text-muted-foreground">30s REFRESH CYCLE</span>
            </div>
          </div>

          <DuplicateReview />

          <LeadDashboard
            leads={leads}
            onLeadsChange={setLeads}
            onLeadSelect={setSelectedLead}
          />
        </div>

        {/* 3. OPERATIONAL INTELLIGENCE (4 Columns) */}
        <div className="col-span-12 lg:col-span-4 space-y-6 lg:sticky lg:top-8">
          {/* Revenue Risk Awareness */}
          <RevenueRisk atRiskCount={stats.highRisk} estimatedLoss={estimatedLoss} avgDealValue={avgDealValue} />

          {/* Ecosystem Status — real integration health */}
          <IntegrationIndicators />

          {/* Automation Observability */}
          <AutomationHealth events={healthEvents} />

          {/* Selected Lead Intel */}
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
