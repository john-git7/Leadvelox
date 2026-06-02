'use client';

import { useState, useEffect, useMemo } from 'react';
import { updateLeadStatus, deleteLead, acknowledgeAlert, assignLead, requestLeadDeletion, bulkDeleteLeads, rejectLeadDeletion } from '@/app/actions/leads';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { MoreVertical, Trash, AlertCircle, Zap, ShieldAlert, Clock, AlertTriangle, ChevronLeft, ChevronRight, UserRound, UserCheck, XCircle, CheckCircle2 } from 'lucide-react';
import { DecayStatus } from '@/lib/orchestration';
import { SLAStatus } from '@/lib/sla';
import type { Agent } from './CommandCenter';

type Lead = {
  id: string;
  name: string;
  email: string;
  phone: string;
  source: string;
  status: string;
  urgency_score: number;
  decay_status: DecayStatus;
  is_duplicate: boolean;
  duplicate_reason?: string;
  response_deadline: string | null;
  sla_status: SLAStatus;
  sla_breached_at: string | null;
  created_at: string;
  last_contacted_at?: string | null;
  last_acknowledged_at?: string | null;
  assigned_agent_id?: string | null;
  escalation_level: number;
  delete_requested?: boolean;
};

interface LeadDashboardProps {
  // Data
  leads: Lead[];
  totalCount: number;
  page: number;
  pageSize: number;
  search: string;
  statusFilter: string;
  startDate?: string;
  endDate?: string;
  agents: Agent[];
  currentUserRole?: 'ADMIN' | 'MANAGER' | 'AGENT';
  currentUserId?: string;
  // Callbacks — all filtering/pagination is server-driven
  onLeadsChange: (leads: Lead[]) => void;
  onLeadSelect?: (lead: Lead) => void;
  selectedLeadId?: string;
  onSearchChange: (search: string) => void;
  onStatusFilterChange: (status: string) => void;
  onDateFilterChange?: (start: string, end: string) => void;
  onPageChange: (page: number) => void;
}

// ─── SLA countdown timer ──────────────────────────────────────────────────────
export function SLATimer({ deadline, status }: { deadline: string | null, status: string }) {
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [isBreached, setIsBreached] = useState(false);

  useEffect(() => {
    if (!deadline || status !== 'New Lead') return;

    const calculate = () => {
      const target = new Date(deadline).getTime();
      const now = new Date().getTime();
      const diff = target - now;

      if (diff <= 0) {
        setTimeLeft('SLA BREACHED');
        setIsBreached(true);
      } else {
        const h = Math.floor(diff / (1000 * 60 * 60));
        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((diff % (1000 * 60)) / 1000);

        if (h > 0) {
          setTimeLeft(`${h}h ${m}m`);
        } else {
          setTimeLeft(`${m}:${s.toString().padStart(2, '0')}`);
        }
        setIsBreached(false);
      }
    };

    calculate();
    const interval = setInterval(calculate, 1000);
    return () => clearInterval(interval);
  }, [deadline, status]);

  if (!deadline || status !== 'New Lead') return null;

  return (
    <div className={`flex items-center gap-1.5 font-mono text-[9px] font-bold tracking-tighter ${isBreached ? 'text-red-500 animate-pulse' : 'text-orange-500'}`}>
      {isBreached ? <AlertTriangle className="w-2.5 h-2.5" /> : <Clock className="w-2.5 h-2.5" />}
      {isBreached ? 'BREACHED' : timeLeft}
    </div>
  );
}

// ─── Breach age counter ───────────────────────────────────────────────────────
function BreachAge({ breachedAt }: { breachedAt: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);

  const diffMinutes = Math.max(0, Math.floor((now - new Date(breachedAt).getTime()) / 60000));
  const label = diffMinutes >= 60
    ? `${Math.floor(diffMinutes / 60)}h ${diffMinutes % 60}m overdue`
    : `${diffMinutes}m overdue`;

  return (
    <span
      suppressHydrationWarning
      title="Total time this lead has been ignored since their SLA deadline expired"
      className="text-[9px] font-mono text-red-500 font-bold"
    >
      {label}
    </span>
  );
}

// ─── Snooze Action Component ──────────────────────────────────────────────────
function SnoozeAction({ leadId, lastAcknowledgedAt, onAcknowledge }: { leadId: string, lastAcknowledgedAt?: string | null, onAcknowledge: (id: string) => void }) {
  const [timeLeft, setTimeLeft] = useState('');
  const [isSnoozed, setIsSnoozed] = useState(false);

  useEffect(() => {
    if (!lastAcknowledgedAt) {
      setIsSnoozed(false);
      return;
    }
    const calc = () => {
      const ackTime = new Date(lastAcknowledgedAt).getTime();
      const snoozeEnd = ackTime + 30 * 60 * 1000;
      const diff = snoozeEnd - Date.now();

      if (diff <= 0) {
        setIsSnoozed(false);
        setTimeLeft('');
      } else {
        setIsSnoozed(true);
        const m = Math.floor(diff / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        setTimeLeft(`${m}m ${s.toString().padStart(2, '0')}s`);
      }
    };
    calc();
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, [lastAcknowledgedAt]);

  if (isSnoozed) {
    return (
      <div className="flex items-center gap-1.5 px-2 h-6 bg-yellow-500/10 border border-yellow-500/20 rounded" title="Escalations paused">
        <Clock className="w-2.5 h-2.5 text-yellow-500" />
        <span className="text-[9px] font-mono font-bold text-yellow-500">{timeLeft}</span>
      </div>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={(e) => { e.stopPropagation(); onAcknowledge(leadId); }}
      title="Pause SLA escalations for 30 minutes"
      className="h-6 text-[9px] font-bold uppercase tracking-tighter bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/20 hover:text-red-400"
    >
      Acknowledge
    </Button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function LeadDashboard({
  leads,
  totalCount,
  page,
  pageSize,
  search,
  statusFilter,
  startDate,
  endDate,
  agents,
  onLeadsChange,
  onLeadSelect,
  selectedLeadId,
  onSearchChange,
  onStatusFilterChange,
  onDateFilterChange,
  onPageChange,
  currentUserRole = 'AGENT',
  currentUserId,
}: LeadDashboardProps) {
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [leadToDelete, setLeadToDelete] = useState<Lead | null>(null);

  // Sort leads: Unassigned Level 1 SLA warnings come first
  const sortedLeads = useMemo(() => {
    return [...leads].sort((a, b) => {
      const aUrgent = a.assigned_agent_id === null && (a.escalation_level ?? 0) >= 1;
      const bUrgent = b.assigned_agent_id === null && (b.escalation_level ?? 0) >= 1;
      if (aUrgent && !bUrgent) return -1;
      if (!aUrgent && bUrgent) return 1;
      return 0; // preserve original order (created_at)
    });
  }, [leads]);

  const [statusChange, setStatusChange] = useState<{ id: string, newStatus: string, currentStatus: string, leadName: string } | null>(null);
  const [outcomeNote, setOutcomeNote] = useState('');
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const from = totalCount === 0 ? 0 : page * pageSize + 1;
  const to = Math.min((page + 1) * pageSize, totalCount);

  // Build agent lookup map for display
  const agentMap = new Map(agents.map(a => [a.id, a]));

  const handleStatusChange = async (id: string, newStatus: string, note?: string) => {
    setUpdatingId(id);
    const result = await updateLeadStatus(id, newStatus, note);
    if (result.success) {
      toast.success('Status synchronized');
      const contactedAt = newStatus === 'New Lead' ? null : new Date().toISOString();
      onLeadsChange(leads.map(lead => lead.id === id ? {
        ...lead,
        status: newStatus,
        last_contacted_at: contactedAt,
        sla_status: newStatus === 'New Lead' ? lead.sla_status : 'HEALTHY',
        sla_breached_at: newStatus === 'New Lead' ? lead.sla_breached_at : null,
      } : lead));
    } else {
      toast.error(result.error || 'Failed to update status');
    }
    setUpdatingId(null);
  };

  const handleSelectChange = (lead: Lead, newStatus: string) => {
    if (lead.status === 'New Lead' && newStatus !== 'New Lead') {
      setStatusChange({ id: lead.id, newStatus, currentStatus: lead.status, leadName: lead.name.split(' ')[0] });
      setOutcomeNote('');
    } else {
      handleStatusChange(lead.id, newStatus);
    }
  };

  const toggleLeadSelection = (id: string) => {
    const next = new Set(selectedLeadIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedLeadIds(next);
  };

  const toggleAllSelection = () => {
    if (selectedLeadIds.size === leads.length && leads.length > 0) {
      setSelectedLeadIds(new Set());
    } else {
      setSelectedLeadIds(new Set(leads.map(l => l.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedLeadIds.size === 0) return;
    setIsBulkDeleting(true);
    const result = await bulkDeleteLeads(Array.from(selectedLeadIds));
    if (result.success) {
      toast.success(`Deleted ${selectedLeadIds.size} leads.`);
      onLeadsChange(leads.filter(l => !selectedLeadIds.has(l.id)));
      setSelectedLeadIds(new Set());
    } else {
      toast.error(result.error || 'Bulk delete failed');
    }
    setIsBulkDeleting(false);
  };

  const handleRequestDeletion = async (id: string) => {
    const result = await requestLeadDeletion(id);
    if (result.success) {
      toast.success('Deletion request sent to managers.');
      onLeadsChange(leads.map(l => l.id === id ? { ...l, delete_requested: true } : l));
    } else {
      toast.error(result.error || 'Request failed');
    }
  };

  const handleRejectDeletion = async (id: string) => {
    const result = await rejectLeadDeletion(id);
    if (result.success) {
      toast.success('Deletion request rejected. Lead remains active.');
      onLeadsChange(leads.map(l => l.id === id ? { ...l, delete_requested: false } : l));
    } else {
      toast.error(result.error || 'Failed to reject deletion request');
    }
  };

  const confirmDelete = async () => {
    if (!leadToDelete) return;
    const result = await deleteLead(leadToDelete.id);
    if (result.success) {
      toast.success('Lead record deleted');
      onLeadsChange(leads.filter(lead => lead.id !== leadToDelete.id));
    } else {
      toast.error(result.error || 'Delete failed');
    }
    setLeadToDelete(null);
  };

  const handleAcknowledge = async (id: string) => {
    const result = await acknowledgeAlert(id);
    if (result.success) {
      toast.success('Alert acknowledged. Escalation paused.');
      onLeadsChange(leads.map(lead => lead.id === id ? { ...lead, last_acknowledged_at: new Date().toISOString() } : lead));
    } else {
      toast.error('Failed to acknowledge alert');
    }
  };

  const handleAssign = async (leadId: string, agentId: string | null) => {
    setAssigningId(leadId);
    const result = await assignLead(leadId, agentId);
    if (result.success) {
      const agentEmail = agentId ? (agentMap.get(agentId)?.email ?? agentId.slice(0, 8)) : 'nobody';
      toast.success(agentId ? `Assigned to ${agentEmail}` : 'Lead unassigned');
      onLeadsChange(leads.map(l => l.id === leadId ? { ...l, assigned_agent_id: agentId } : l));
    } else {
      toast.error('Assignment failed');
    }
    setAssigningId(null);
  };

  const getDecayColor = (status: DecayStatus) => {
    switch (status) {
      case 'HOT': return 'text-orange-500 bg-orange-500/10 border-orange-500/20';
      case 'WARM': return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20';
      case 'COLD': return 'text-blue-500 bg-blue-500/10 border-blue-500/20';
      case 'HIGH_RISK': return 'text-red-500 bg-red-500/10 border-red-500/20';
      default: return 'text-muted-foreground bg-muted/10 border-muted/20';
    }
  };

  return (
    <div className="bg-[#0A0A0A] border border-[#262626] rounded-md overflow-hidden flex flex-col h-full">
      {/* ── Search + Filter Bar ───────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-2 p-3 border-b border-[#262626] bg-[#0A0A0A] shrink-0">
        <input
          type="text"
          placeholder="Search name, email, phone…"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          className="flex-1 px-3 py-1.5 bg-[#111111] border border-[#262626] rounded text-[11px] text-[#FAFAFA] placeholder:text-muted-foreground focus:outline-none focus:border-[#404040] font-mono"
        />
        <select
          value={statusFilter}
          onChange={e => onStatusFilterChange(e.target.value)}
          className="px-3 py-1.5 bg-[#111111] border border-[#262626] rounded text-[10px] text-[#FAFAFA] font-bold uppercase focus:outline-none focus:border-[#404040]"
        >
          <option value="All">ALL STATUS</option>
          <option value="New Lead">NEW LEAD</option>
          <option value="Contacted">CONTACTED</option>
          <option value="Qualified">QUALIFIED</option>
          <option value="Lost">LOST</option>
          <option value="Closed">CLOSED</option>
          <option value="Delete Requested">DELETE REQUESTED</option>
        </select>
        <input
          type="date"
          value={startDate || ''}
          onChange={e => onDateFilterChange?.(e.target.value, endDate || '')}
          className="px-2 py-1.5 bg-[#111111] border border-[#262626] rounded text-[10px] text-muted-foreground focus:outline-none focus:border-[#404040]"
        />
        <span className="text-muted-foreground text-[10px] flex items-center shrink-0">to</span>
        <input
          type="date"
          value={endDate || ''}
          onChange={e => onDateFilterChange?.(startDate || '', e.target.value)}
          className="px-2 py-1.5 bg-[#111111] border border-[#262626] rounded text-[10px] text-muted-foreground focus:outline-none focus:border-[#404040]"
        />
        {(search || statusFilter !== 'All' || startDate || endDate) && (
          <button
            onClick={() => { onSearchChange(''); onStatusFilterChange('All'); onDateFilterChange?.('', ''); }}
            className="px-3 py-1.5 bg-[#111111] border border-[#262626] rounded text-[10px] text-muted-foreground hover:text-[#FAFAFA] font-bold uppercase transition-colors shrink-0"
          >
            Clear
          </button>
        )}
        <div className="ml-auto hidden sm:flex items-center text-[9px] font-mono text-zinc-500 bg-[#111111] border border-[#262626] rounded px-2 py-1 shrink-0">
          SORT: URGENCY ↓ · NEWEST ↓
        </div>
      </div>

      {/* ── Bulk Actions Bar ─────────────────────────────────────────────── */}
      {selectedLeadIds.size > 0 && (
        <div className="flex items-center justify-between p-2 bg-[#1a1a1a] border-b border-[#262626] shrink-0">
          <span className="text-[11px] font-bold text-[#FAFAFA] px-2">{selectedLeadIds.size} selected</span>
          {currentUserRole === 'AGENT' ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                selectedLeadIds.forEach(id => handleRequestDeletion(id));
                setSelectedLeadIds(new Set());
              }}
              className="h-7 text-[10px] uppercase tracking-wider bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/20 hover:text-red-400"
            >
              Request Deletion for Selected
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={handleBulkDelete}
              disabled={isBulkDeleting}
              className="h-7 text-[10px] uppercase tracking-wider bg-red-950/80 text-red-400 border-red-500 hover:bg-red-900"
            >
              {isBulkDeleting ? 'Deleting...' : 'Delete Selected'}
            </Button>
          )}
        </div>
      )}

      {/* ── Lead Table ───────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader className="bg-[#111111]">
            <TableRow className="border-[#262626] hover:bg-transparent">
              <TableHead className="w-10 text-center py-2">
                <input
                  type="checkbox"
                  checked={leads.length > 0 && selectedLeadIds.size === leads.length}
                  onChange={toggleAllSelection}
                  className="accent-red-500 cursor-pointer"
                />
              </TableHead>
              <TableHead className="text-[10px] uppercase font-bold text-muted-foreground py-2">Lead / Intelligence</TableHead>
              <TableHead className="text-[10px] uppercase font-bold text-muted-foreground py-2">Assigned</TableHead>
              <TableHead className="text-[10px] uppercase font-bold text-muted-foreground py-2">SLA Status</TableHead>
              <TableHead className="text-[10px] uppercase font-bold text-muted-foreground py-2">Breach Time</TableHead>
              <TableHead className="text-[10px] uppercase font-bold text-muted-foreground py-2">Score</TableHead>
              <TableHead className="text-[10px] uppercase font-bold text-muted-foreground py-2">Decay</TableHead>
              <TableHead className="text-[10px] uppercase font-bold text-muted-foreground py-2">Status</TableHead>
              <TableHead className="text-[10px] uppercase font-bold text-muted-foreground py-2 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedLeads.length === 0 ? (
              <TableRow className="border-[#262626]">
                <TableCell colSpan={8} className="h-32 text-center text-[11px] text-muted-foreground">
                  {search || statusFilter !== 'All' ? 'NO LEADS MATCH YOUR FILTERS' : 'NO ACTIVE LEADS IN QUEUE'}
                </TableCell>
              </TableRow>
            ) : (
              sortedLeads.map((lead) => {
                const assignedAgent = lead.assigned_agent_id ? agentMap.get(lead.assigned_agent_id) : null;
                const isUrgentUnassigned = lead.assigned_agent_id === null && (lead.escalation_level ?? 0) >= 1;
                return (
                  <TableRow
                    key={lead.id}
                    className={`border-[#262626] cursor-pointer transition-colors group ${lead.id === selectedLeadId ? 'bg-[#1a1a1a]' : ''} ${
                      isUrgentUnassigned
                        ? 'bg-red-500/10 hover:bg-red-500/20 animate-pulse border-red-500/30'
                        : lead.sla_status === 'BREACHED' ? 'bg-red-950/20 hover:bg-red-900/30' : 'hover:bg-[#111111]/50'
                    }`}
                    onClick={() => onLeadSelect?.(lead)}
                  >
                    {/* Checkbox */}
                    <TableCell className="w-10 text-center py-2" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedLeadIds.has(lead.id)}
                        onChange={() => toggleLeadSelection(lead.id)}
                        className="accent-red-500 cursor-pointer"
                      />
                    </TableCell>

                    {/* Lead / Intelligence */}
                    <TableCell className="py-2">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-semibold text-[#FAFAFA] truncate max-w-[150px]">{lead.name}</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded border border-[#262626] bg-[#1A1A1A] text-muted-foreground uppercase font-bold tracking-wider shrink-0">{lead.source}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-muted-foreground font-mono truncate">{lead.email}</span>
                          {lead.is_duplicate && (
                            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/20 text-[9px] font-bold text-red-500 uppercase whitespace-nowrap shrink-0">
                              <ShieldAlert className="w-2.5 h-2.5 shrink-0" /> Duplicate {lead.duplicate_reason ? `(${lead.duplicate_reason})` : ''}
                            </div>
                          )}
                          {lead.delete_requested && (
                            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-orange-500/10 border border-orange-500/20 text-[9px] font-bold text-orange-500 uppercase whitespace-nowrap shrink-0">
                              <AlertCircle className="w-2.5 h-2.5 shrink-0" /> Delete Requested
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>

                    {/* Assigned Agent */}
                    <TableCell className="py-2" onClick={e => e.stopPropagation()}>
                      {agents.length === 0 ? (
                        <span className="text-[9px] text-zinc-600">—</span>
                      ) : (
                        <Select
                          value={lead.assigned_agent_id ?? '__none__'}
                          onValueChange={val => handleAssign(lead.id, val === '__none__' ? null : val)}
                          disabled={assigningId === lead.id}
                        >
                          <SelectTrigger className="h-6 w-[110px] bg-transparent border-[#262626] text-[9px] font-bold text-muted-foreground hover:text-[#FAFAFA]">
                            <div className="flex items-center gap-1.5 truncate">
                              {assignedAgent
                                ? <><UserCheck className="w-2.5 h-2.5 text-green-500 shrink-0" /><span className="truncate">{assignedAgent.email.split('@')[0]}</span></>
                                : <><UserRound className="w-2.5 h-2.5 text-zinc-600 shrink-0" /><span className="text-zinc-600">Unassigned</span></>
                              }
                            </div>
                          </SelectTrigger>
                          <SelectContent className="bg-[#0A0A0A] border-[#262626] text-[#FAFAFA]">
                            <SelectItem value="__none__" className="text-[10px] text-zinc-500">
                              Unassigned
                            </SelectItem>
                            {agents.filter(agent => currentUserRole !== 'AGENT' || agent.id === currentUserId).map(agent => (
                              <SelectItem key={agent.id} value={agent.id} className="text-[10px] font-medium">
                                <div className="flex flex-col">
                                  <span>{agent.email}</span>
                                  <span className="text-[9px] text-zinc-500 uppercase">{agent.role}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>

                    {/* SLA Status */}
                    <TableCell className="py-2">
                      <div className="flex flex-col gap-1 items-start">
                        <SLATimer deadline={lead.response_deadline} status={lead.status} />
                        {(lead.escalation_level ?? 0) > 0 && lead.status === 'New Lead' && (
                          <div
                            title={
                              lead.escalation_level === 1 ? 'SLA Warning - 5 minute initial response deadline missed.' :
                              lead.escalation_level === 2 ? 'Priority Alert - Dashboard visibility escalated.' :
                              lead.escalation_level === 3 ? 'Manager Webhook - Slack/Email notification triggered to management.' :
                              'Critical Alert - 60+ minutes overdue. Escalation webhook re-fired.'
                            }
                            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider whitespace-nowrap
                            ${lead.escalation_level === 1 ? 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20' : ''}
                            ${lead.escalation_level === 2 ? 'bg-orange-500/10 text-orange-500 border border-orange-500/20' : ''}
                            ${lead.escalation_level === 3 ? 'bg-red-500/10 text-red-500 border border-red-500/20' : ''}
                            ${(lead.escalation_level ?? 0) >= 4 ? 'bg-red-950/80 text-red-400 border border-red-500 animate-pulse' : ''}
                          `}
                          >
                            {lead.escalation_level === 1 && 'Lvl 1: Warning'}
                            {lead.escalation_level === 2 && 'Lvl 2: Priority'}
                            {lead.escalation_level === 3 && 'Lvl 3: Webhook'}
                            {(lead.escalation_level ?? 0) >= 4 && 'Lvl 4: Critical'}
                          </div>
                        )}
                      </div>
                    </TableCell>

                    {/* Breach Time */}
                    <TableCell className="py-2">
                      {lead.sla_status === 'BREACHED' && lead.sla_breached_at ? (
                        <BreachAge breachedAt={lead.sla_breached_at} />
                      ) : (
                        <span className="text-[9px] text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    {/* Urgency Score */}
                    <TableCell className="py-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1 w-10 bg-[#171717] rounded-full overflow-hidden border border-[#262626]">
                          <div
                            className={`h-full transition-all ${lead.urgency_score > 70 ? 'bg-orange-500' : 'bg-blue-500'}`}
                            style={{ width: `${lead.urgency_score}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-mono font-bold text-[#FAFAFA]">{lead.urgency_score}</span>
                      </div>
                    </TableCell>

                    {/* Decay */}
                    <TableCell className="py-2">
                      {lead.status === 'New Lead' ? (
                        // Active decay — only meaningful while the lead is uncontacted
                        <div
                          title="Algorithmic grade indicating conversion likelihood based on time since inquiry"
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] font-bold border ${getDecayColor(lead.decay_status)}`}
                        >
                          {lead.decay_status === 'HOT' && <Zap className="w-2.5 h-2.5 fill-current" />}
                          {lead.decay_status === 'HIGH_RISK' && <AlertCircle className="w-2.5 h-2.5" />}
                          {lead.decay_status}
                        </div>
                      ) : (
                        // Lead has been actioned — decay is no longer the operative metric
                        <div
                          title={`Lead status: ${lead.status} — decay frozen at contact`}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold border border-zinc-700/40 bg-zinc-800/30 text-zinc-600"
                        >
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          RESOLVED
                        </div>
                      )}
                    </TableCell>

                    {/* Status */}
                    <TableCell className="py-2" onClick={(e) => e.stopPropagation()}>
                      <Select
                        value={lead.status}
                        onValueChange={(val) => val && val !== lead.status && handleSelectChange(lead, val)}
                        disabled={updatingId === lead.id}
                      >
                        <SelectTrigger className="h-6 w-[100px] bg-[#111111] border-[#262626] text-[9px] font-bold text-[#FAFAFA] uppercase tracking-tighter">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[#0A0A0A] border-[#262626] text-[#FAFAFA]">
                          <SelectItem value="New Lead" className="text-[10px] uppercase font-bold">New Lead</SelectItem>
                          <SelectItem value="Contacted" className="text-[10px] uppercase font-bold">Contacted</SelectItem>
                          <SelectItem value="Qualified" className="text-[10px] uppercase font-bold">Qualified</SelectItem>
                          <SelectItem value="Lost" className="text-[10px] uppercase font-bold">Lost</SelectItem>
                          <SelectItem value="Closed" className="text-[10px] uppercase font-bold">Closed</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {lead.status === 'New Lead' && lead.sla_status === 'BREACHED' && (
                          <SnoozeAction
                            leadId={lead.id}
                            lastAcknowledgedAt={lead.last_acknowledged_at}
                            onAcknowledge={handleAcknowledge}
                          />
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-[#FAFAFA] hover:bg-[#171717]" onClick={(e) => e.stopPropagation()}>
                                <MoreVertical className="h-3 w-3" />
                              </Button>
                            }
                          />
                          <DropdownMenuContent align="end" className="bg-[#0A0A0A] border-[#262626] text-[#FAFAFA]">
                            {currentUserRole === 'AGENT' ? (
                              <DropdownMenuItem
                                className="text-[11px] font-medium text-red-500 focus:text-red-500 focus:bg-red-500/10 cursor-pointer"
                                onClick={(e) => { e.stopPropagation(); handleRequestDeletion(lead.id); }}
                              >
                                <Trash className="w-3.5 h-3.5 mr-2" /> Request Deletion
                              </DropdownMenuItem>
                            ) : (
                              <>
                                {/* Reject a pending deletion request — clears the flag, keeps the lead */}
                                {lead.delete_requested && (
                                  <DropdownMenuItem
                                    className="text-[11px] font-medium text-green-500 focus:text-green-500 focus:bg-green-500/10 cursor-pointer"
                                    onClick={(e) => { e.stopPropagation(); handleRejectDeletion(lead.id); }}
                                  >
                                    <XCircle className="w-3.5 h-3.5 mr-2" /> Reject Deletion Request
                                  </DropdownMenuItem>
                                )}
                                {lead.delete_requested && (
                                  <DropdownMenuSeparator className="bg-[#262626]" />
                                )}
                                <DropdownMenuItem
                                  className="text-[11px] font-medium text-red-500 focus:text-red-500 focus:bg-red-500/10 cursor-pointer"
                                  onClick={(e) => { e.stopPropagation(); setLeadToDelete(lead); }}
                                >
                                  <Trash className="w-3.5 h-3.5 mr-2" /> Delete Lead
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* ── Pagination Footer ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-[#262626] bg-[#0A0A0A] shrink-0">
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
          {totalCount === 0 ? 'No results' : `Showing ${from}–${to} of ${totalCount.toLocaleString()}`}
          {(search || statusFilter !== 'All') ? ' (filtered)' : ''}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page - 1)}
            disabled={page === 0}
            className="h-7 w-7 p-0 bg-[#111111] border-[#262626] text-muted-foreground hover:text-[#FAFAFA]"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="text-[10px] font-mono text-muted-foreground px-1">
            {page + 1} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages - 1}
            className="h-7 w-7 p-0 bg-[#111111] border-[#262626] text-muted-foreground hover:text-[#FAFAFA]"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* ── Status Change Dialog ──────────────────────────────────────────── */}
      <Dialog open={!!statusChange} onOpenChange={(open) => !open && setStatusChange(null)}>
        <DialogContent className="bg-[#0A0A0A] border border-[#262626] text-[#FAFAFA] sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-[#FAFAFA] uppercase tracking-tighter italic font-black text-xl">
              Log Contact Outcome {statusChange?.leadName && `— ${statusChange.leadName}`}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-[11px] font-medium mt-2">
              SLA regulations require a mandatory note (min. 20 characters) when changing a lead's status out of "New Lead".
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <textarea
              className="w-full h-24 p-3 bg-[#111111] border border-[#262626] rounded-md text-[11px] text-[#FAFAFA] placeholder:text-muted-foreground focus:outline-none focus:border-[#404040] font-mono resize-none"
              placeholder="e.g., Spoke to John, he is looking for a 3-bedroom in downtown. Follow up next Tuesday."
              value={outcomeNote}
              onChange={(e) => setOutcomeNote(e.target.value)}
            />
            <div className="text-right mt-1 text-[9px] text-muted-foreground">
              {outcomeNote.trim().length} / 20 chars
            </div>
          </div>
          <DialogFooter className="border-t border-[#262626] pt-4 sm:justify-start gap-2">
            <Button
              type="button"
              disabled={outcomeNote.trim().length < 20}
              onClick={() => {
                if (statusChange) {
                  handleStatusChange(statusChange.id, statusChange.newStatus, outcomeNote);
                  setStatusChange(null);
                }
              }}
              className="bg-[#FAFAFA] hover:bg-zinc-200 text-[#0A0A0A] font-bold text-[10px] uppercase tracking-wider disabled:opacity-50"
            >
              Confirm Contact
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setStatusChange(null)}
              className="bg-[#111111] hover:bg-[#171717] border-[#262626] text-[#FAFAFA] font-bold text-[10px] uppercase tracking-wider"
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation Dialog ────────────────────────────────────── */}
      <Dialog open={!!leadToDelete} onOpenChange={(open) => !open && setLeadToDelete(null)}>
        <DialogContent className="bg-[#0A0A0A] border border-[#262626] text-[#FAFAFA] sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-500 uppercase tracking-tighter italic font-black text-xl">
              <ShieldAlert className="w-5 h-5" />
              Confirm Delete
            </DialogTitle>
            <DialogDescription className="text-muted-foreground uppercase text-[10px] tracking-widest font-bold mt-2">
              Are you sure you want to permanently delete this lead record?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="p-3 bg-[#111111] border border-[#262626] rounded-md font-mono text-[10px] text-muted-foreground">
              <p>ID: {leadToDelete?.id}</p>
              <p>Name: {leadToDelete?.name}</p>
              <p className="text-red-500 mt-2">! THIS ACTION IS IRREVERSIBLE.</p>
            </div>
          </div>
          <DialogFooter className="border-t border-[#262626] pt-4 sm:justify-start gap-2">
            <Button
              type="button"
              variant="destructive"
              onClick={confirmDelete}
              className="bg-red-500 hover:bg-red-600 text-[#FAFAFA] font-bold text-[10px] uppercase tracking-wider"
            >
              Delete Lead
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setLeadToDelete(null)}
              className="bg-[#111111] hover:bg-[#171717] border-[#262626] text-[#FAFAFA] font-bold text-[10px] uppercase tracking-wider"
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
