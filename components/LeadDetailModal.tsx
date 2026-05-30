'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  User,
  Mail,
  Phone,
  Globe,
  Clock,
  Zap,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  Activity,
  CheckCircle,
  XCircle,
  RefreshCw,
  Calendar,
  TrendingUp,
  UserCheck,
  Info,
  AlertCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { getLeadEvents } from '@/app/actions/leads';
import { DecayStatus } from '@/lib/orchestration';
import { SLAStatus, EventSeverity } from '@/lib/sla';

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

type Agent = {
  id: string;
  email: string;
  role: string;
};

type LeadEvent = {
  id: string;
  event_type: string;
  description: string;
  severity: EventSeverity;
  created_at: string;
};

interface LeadDetailModalProps {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agents?: Agent[];
}

// ─── SLA Live Countdown ────────────────────────────────────────────────────────
function SLACountdown({ deadline, status }: { deadline: string | null; status: string }) {
  const [timeLeft, setTimeLeft] = useState('');
  const [breached, setBreached] = useState(false);

  useEffect(() => {
    if (!deadline || status !== 'New Lead') return;
    const calc = () => {
      const diff = new Date(deadline).getTime() - Date.now();
      if (diff <= 0) { setBreached(true); setTimeLeft('BREACHED'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setBreached(false);
      setTimeLeft(h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`);
    };
    calc();
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, [deadline, status]);

  if (!deadline || status !== 'New Lead') return <span className="text-zinc-600 font-mono text-xs">N/A</span>;

  return (
    <span
      className={`font-mono text-sm font-black tracking-tighter ${
        breached ? 'text-red-500 animate-pulse' : 'text-orange-400'
      }`}
    >
      {timeLeft}
    </span>
  );
}

// ─── Snooze Countdown ──────────────────────────────────────────────────────────
function SnoozeCountdown({ lastAcknowledgedAt }: { lastAcknowledgedAt: string | null | undefined }) {
  const [timeLeft, setTimeLeft] = useState('');
  const [isSnoozed, setIsSnoozed] = useState(false);

  useEffect(() => {
    if (!lastAcknowledgedAt) {
      setIsSnoozed(false);
      return;
    }
    const calc = () => {
      const diff = new Date(lastAcknowledgedAt).getTime() + 30 * 60 * 1000 - Date.now();
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

  if (!isSnoozed) return null;

  return (
    <span className="text-[9px] font-black px-2 py-0.5 rounded border uppercase tracking-wider text-yellow-400 border-yellow-500/30 bg-yellow-500/10 flex items-center gap-1">
      <Clock className="w-2.5 h-2.5" />
      SNOOZED: {timeLeft}
    </span>
  );
}

// ─── Escalation Journey ────────────────────────────────────────────────────────
function EscalationJourney({ level, deadline }: { level: number; deadline: string | null }) {
  const steps = [
    { level: 0, label: 'Intake', desc: 'Lead received & scored', color: 'bg-emerald-500' },
    { level: 1, label: 'L1 Warning', desc: 'Response deadline missed', color: 'bg-yellow-500' },
    { level: 2, label: 'L2 Priority', desc: 'Dashboard escalation', color: 'bg-orange-500' },
    { level: 3, label: 'L3 Webhook', desc: 'Manager notified via Slack/Email', color: 'bg-red-500' },
    { level: 4, label: 'L4 Critical', desc: '60+ min overdue — re-fired', color: 'bg-red-700' },
  ];

  return (
    <div className="space-y-2">
      <h4 className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Escalation Journey</h4>
      <div className="flex items-center gap-0">
        {steps.map((step, i) => {
          const reached = level >= step.level;
          const isCurrent = level === step.level;
          return (
            <div key={i} className="flex items-center flex-1 min-w-0">
              <div className="flex flex-col items-center">
                <div
                  title={step.desc}
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-[9px] font-black border-2 transition-all ${
                    isCurrent
                      ? `${step.color} border-white/30 text-white shadow-lg scale-110`
                      : reached
                      ? `${step.color} border-transparent text-white opacity-70`
                      : 'bg-[#1a1a1a] border-[#262626] text-zinc-600'
                  }`}
                >
                  L{step.level}
                </div>
                <span className={`text-[8px] font-bold mt-1 text-center leading-tight whitespace-nowrap ${
                  isCurrent ? 'text-white' : reached ? 'text-zinc-400' : 'text-zinc-700'
                }`}>
                  {step.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div className={`flex-1 h-0.5 mx-1 ${
                  level > step.level ? steps[i + 1].color : 'bg-[#262626]'
                }`} />
              )}
            </div>
          );
        })}
      </div>
      {level >= 1 && (
        <p className="text-[9px] text-zinc-500 mt-1">
          {steps.find(s => s.level === level)?.desc ?? ''}
          {level >= 3 && (
            <span className="text-red-400 font-bold ml-1">
              — Automation webhook triggered
            </span>
          )}
        </p>
      )}
    </div>
  );
}

// ─── Event Timeline ────────────────────────────────────────────────────────────
function EventTimeline({ events, isLoading }: { events: LeadEvent[]; isLoading: boolean }) {
  const getIcon = (type: string, severity: EventSeverity) => {
    if (severity === 'CRITICAL' || severity === 'HIGH') return <ShieldAlert className="w-3.5 h-3.5 text-red-500" />;
    switch (type.toLowerCase()) {
      case 'intake': return <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />;
      case 'status change': return <Activity className="w-3.5 h-3.5 text-blue-400" />;
      case 'sla breach': return <AlertTriangle className="w-3.5 h-3.5 text-red-500" />;
      case 'automation': return <Mail className="w-3.5 h-3.5 text-purple-400" />;
      case 'workflow': return <Info className="w-3.5 h-3.5 text-blue-500" />;
      default: return <Clock className="w-3.5 h-3.5 text-zinc-500" />;
    }
  };

  const getSeverityStyle = (severity: EventSeverity) => {
    switch (severity) {
      case 'CRITICAL': return 'border-red-500/40 bg-red-500/5';
      case 'HIGH': return 'border-orange-500/40 bg-orange-500/5';
      case 'MEDIUM': return 'border-yellow-500/40 bg-yellow-500/5';
      default: return 'border-[#1F1F1F]';
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="flex gap-3 animate-pulse">
            <div className="w-7 h-7 rounded-full bg-[#1a1a1a] shrink-0" />
            <div className="flex-1 space-y-1.5 pt-1">
              <div className="h-2.5 bg-[#1a1a1a] rounded w-1/3" />
              <div className="h-2 bg-[#1a1a1a] rounded w-2/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <p className="text-[10px] text-zinc-600 text-center py-6 uppercase tracking-widest font-bold">
        No events recorded yet
      </p>
    );
  }

  return (
    <div className="relative space-y-3 before:absolute before:left-3.5 before:top-0 before:h-full before:w-px before:bg-gradient-to-b before:from-[#262626] before:to-transparent">
      {events.map((event) => (
        <div key={event.id} className="relative flex gap-3 pl-8">
          <div
            className={`absolute left-0 w-7 h-7 rounded-full bg-[#111111] border flex items-center justify-center shrink-0 ${getSeverityStyle(event.severity)}`}
          >
            {getIcon(event.event_type, event.severity)}
          </div>
          <div className={`flex-1 p-2.5 rounded border ${getSeverityStyle(event.severity)}`}>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[10px] font-bold text-[#FAFAFA]">{event.event_type}</span>
              {event.severity !== 'INFO' && (
                <span className={`text-[8px] font-black px-1 rounded border uppercase ${
                  event.severity === 'CRITICAL' ? 'text-red-400 border-red-500/20 bg-red-500/10' :
                  event.severity === 'HIGH' ? 'text-orange-400 border-orange-500/20 bg-orange-500/10' :
                  'text-yellow-400 border-yellow-500/20 bg-yellow-500/10'
                }`}>
                  {event.severity}
                </span>
              )}
              <span className="text-[9px] text-zinc-600 ml-auto font-mono">
                {new Date(event.created_at).toLocaleString([], {
                  month: 'short', day: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
              </span>
            </div>
            <p className="text-[10px] text-zinc-400 leading-relaxed">{event.description}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Modal ────────────────────────────────────────────────────────────────
export default function LeadDetailModal({
  lead,
  open,
  onOpenChange,
  agents = [],
}: LeadDetailModalProps) {
  const [events, setEvents] = useState<LeadEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  useEffect(() => {
    if (open && lead) {
      setEventsLoading(true);
      getLeadEvents(lead.id)
        .then((e) => setEvents(e as LeadEvent[]))
        .finally(() => setEventsLoading(false));
    } else {
      setEvents([]);
    }
  }, [open, lead]);

  if (!lead) return null;

  const assignedAgent = agents.find((a) => a.id === lead.assigned_agent_id);

  const decayColors: Record<DecayStatus, string> = {
    HOT: 'text-orange-400 border-orange-500/30 bg-orange-500/10',
    WARM: 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10',
    COLD: 'text-blue-400 border-blue-500/30 bg-blue-500/10',
    HIGH_RISK: 'text-red-400 border-red-500/30 bg-red-500/10',
  };

  const slaColors: Record<SLAStatus, string> = {
    HEALTHY: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
    WARNING: 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10',
    BREACHED: 'text-red-400 border-red-500/30 bg-red-500/10',
  };

  const statusColors: Record<string, string> = {
    'New Lead': 'text-blue-400 border-blue-500/30 bg-blue-500/10',
    Contacted: 'text-purple-400 border-purple-500/30 bg-purple-500/10',
    Qualified: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
    Lost: 'text-red-400 border-red-500/30 bg-red-500/10',
    Closed: 'text-zinc-400 border-zinc-500/30 bg-zinc-500/10',
  };

  // Derive success/fail narrative
  const isSuccess = lead.status === 'Converted' || lead.status === 'Qualified';
  const isFailed = lead.status === 'Lost' || lead.status === 'Disqualified';
  
  const isSnoozed = lead.last_acknowledged_at 
    ? new Date().getTime() - new Date(lead.last_acknowledged_at).getTime() < 30 * 60 * 1000 
    : false;

  // Estimated time to convert (from created_at to last_contacted_at if available)
  let timeToContact: string | null = null;
  if (lead.last_contacted_at && lead.created_at) {
    const diffMs = new Date(lead.last_contacted_at).getTime() - new Date(lead.created_at).getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 60) timeToContact = `${diffMin}m`;
    else timeToContact = `${Math.floor(diffMin / 60)}h ${diffMin % 60}m`;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl bg-[#080808] border border-[#1F1F1F] text-[#FAFAFA] p-0 overflow-hidden shadow-2xl max-h-[90vh] flex flex-col">

        {/* ── STATUS GLOW BAR ── */}
        <div
          className={`h-1 w-full ${
            lead.sla_status === 'BREACHED'
              ? 'bg-gradient-to-r from-red-600 via-red-500 to-red-600 animate-pulse'
              : lead.sla_status === 'WARNING'
              ? 'bg-gradient-to-r from-yellow-600 via-yellow-400 to-yellow-600'
              : isSuccess
              ? 'bg-gradient-to-r from-emerald-700 via-emerald-500 to-emerald-700'
              : 'bg-gradient-to-r from-blue-900 via-blue-600 to-blue-900'
          }`}
        />

        {/* ── HEADER ── */}
        <DialogHeader className="px-6 py-5 border-b border-[#1F1F1F] bg-[#0E0E0E] shrink-0">
          <div className="flex items-start justify-between gap-6">
            <div className="flex items-start gap-4">
              {/* Avatar */}
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-600 to-purple-700 flex items-center justify-center text-white font-black text-lg shrink-0 shadow-lg">
                {lead.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <DialogTitle className="text-xl font-black text-[#FAFAFA] tracking-tight leading-none">
                  {lead.name}
                </DialogTitle>
                <DialogDescription className="text-[10px] text-zinc-500 font-mono mt-1">
                  ID: {lead.id}
                </DialogDescription>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded border uppercase tracking-wider ${statusColors[lead.status] ?? 'text-zinc-400 border-zinc-600 bg-zinc-900'}`}>
                    {lead.status}
                  </span>
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded border uppercase tracking-wider ${decayColors[lead.decay_status]}`}>
                    {lead.decay_status === 'HIGH_RISK' ? '⚠ HIGH RISK' : lead.decay_status}
                  </span>
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded border uppercase tracking-wider ${slaColors[lead.sla_status]}`}>
                    SLA: {lead.sla_status}
                  </span>
                  {lead.is_duplicate && (
                    <span className="text-[9px] font-black px-2 py-0.5 rounded border uppercase tracking-wider text-red-400 border-red-500/30 bg-red-500/10">
                      ⊘ DUPLICATE {lead.duplicate_reason ? `(${lead.duplicate_reason})` : ''}
                    </span>
                  )}
                  <SnoozeCountdown lastAcknowledgedAt={lead.last_acknowledged_at} />
                </div>
              </div>
            </div>

            {/* Urgency Score Gauge */}
            <div className="flex flex-col items-center shrink-0">
              <div className="relative w-14 h-14">
                <svg viewBox="0 0 56 56" className="w-full h-full -rotate-90">
                  <circle cx="28" cy="28" r="22" fill="none" stroke="#1F1F1F" strokeWidth="5" />
                  <circle
                    cx="28" cy="28" r="22" fill="none"
                    stroke={lead.urgency_score > 70 ? '#f97316' : lead.urgency_score > 40 ? '#eab308' : '#3b82f6'}
                    strokeWidth="5"
                    strokeDasharray={`${(lead.urgency_score / 100) * 138.2} 138.2`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className={`text-sm font-black ${lead.urgency_score > 70 ? 'text-orange-400' : lead.urgency_score > 40 ? 'text-yellow-400' : 'text-blue-400'}`}>
                    {lead.urgency_score}
                  </span>
                </div>
              </div>
              <span className="text-[8px] font-bold text-zinc-500 uppercase tracking-widest mt-0.5">Urgency</span>
            </div>
          </div>
        </DialogHeader>

        {/* ── BODY ── */}
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-5 divide-x divide-[#1F1F1F]">

            {/* LEFT: Lead Intelligence (3 cols) */}
            <div className="col-span-3 p-6 space-y-6">

              {/* Contact Info */}
              <div>
                <h4 className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Contact Information</h4>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { icon: Mail, label: 'Email', value: lead.email },
                    { icon: Phone, label: 'Phone', value: lead.phone },
                    { icon: Globe, label: 'Source', value: lead.source },
                    { icon: Calendar, label: 'Submitted', value: new Date(lead.created_at).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) },
                  ].map(({ icon: Icon, label, value }) => (
                    <div key={label} className="p-3 bg-[#111111] border border-[#1F1F1F] rounded-lg flex flex-col gap-1">
                      <span className="text-[8px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
                        <Icon className="w-2.5 h-2.5" /> {label}
                      </span>
                      <span className="text-[11px] font-mono text-[#FAFAFA] truncate">{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* SLA + Assignment */}
              <div>
                <h4 className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Operational Status</h4>
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 bg-[#111111] border border-[#1F1F1F] rounded-lg flex flex-col gap-1">
                    <span className="text-[8px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
                      <Clock className="w-2.5 h-2.5" /> SLA Deadline
                    </span>
                    <SLACountdown deadline={lead.response_deadline} status={lead.status} />
                  </div>
                  <div className="p-3 bg-[#111111] border border-[#1F1F1F] rounded-lg flex flex-col gap-1">
                    <span className="text-[8px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
                      <UserCheck className="w-2.5 h-2.5" /> Assigned Agent
                    </span>
                    <span className="text-[11px] font-mono text-[#FAFAFA] truncate">
                      {assignedAgent ? assignedAgent.email.split('@')[0] : <span className="text-zinc-600">Unassigned</span>}
                    </span>
                  </div>
                  <div className="p-3 bg-[#111111] border border-[#1F1F1F] rounded-lg flex flex-col gap-1">
                    <span className="text-[8px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
                      <TrendingUp className="w-2.5 h-2.5" /> Time to Contact
                    </span>
                    <span className={`text-[11px] font-mono font-bold ${timeToContact ? (timeToContact.includes('h') || parseInt(timeToContact) > 15 ? 'text-red-400' : 'text-emerald-400') : 'text-zinc-600'}`}>
                      {timeToContact ?? '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Outcome / narrative */}
              <div className={`p-4 rounded-lg border flex items-start gap-3 ${
                isSuccess
                  ? 'bg-emerald-950/30 border-emerald-500/20'
                  : isFailed
                  ? 'bg-red-950/30 border-red-500/20'
                  : lead.sla_status === 'BREACHED'
                  ? 'bg-red-950/20 border-red-500/20'
                  : 'bg-blue-950/20 border-blue-500/20'
              }`}>
                <div className={`p-1.5 rounded-full ${
                  isSuccess ? 'bg-emerald-500/20' : isFailed ? 'bg-red-500/20' : 'bg-blue-500/20'
                }`}>
                  {isSuccess ? <CheckCircle className="w-4 h-4 text-emerald-400" /> :
                   isFailed ? <XCircle className="w-4 h-4 text-red-400" /> :
                   lead.sla_status === 'BREACHED' ? <AlertTriangle className="w-4 h-4 text-red-400" /> :
                   <Activity className="w-4 h-4 text-blue-400" />}
                </div>
                <div>
                  <p className="text-[10px] font-black text-[#FAFAFA] uppercase tracking-wider">
                    {isSuccess ? `Outcome: ${lead.status}` :
                     isFailed ? 'Outcome: Lead Lost' :
                     lead.sla_status === 'BREACHED' ? (isSnoozed ? 'Alert: SLA Breached — Escalations Paused' : 'Alert: SLA Breached — Escalation Active') :
                     'Status: Active in Pipeline'}
                  </p>
                  <p className="text-[10px] text-zinc-400 mt-0.5 leading-relaxed">
                    {isSuccess && timeToContact
                      ? `Successfully converted in ${timeToContact}. Response time was within acceptable SLA window.`
                      : isSuccess
                      ? 'Lead successfully converted. No contact time recorded.'
                      : isFailed
                      ? 'Lead marked as lost. Review escalation history to identify response gaps.'
                      : lead.sla_status === 'BREACHED'
                      ? (isSnoozed 
                          ? `SLA breached. Escalations currently paused at level ${lead.escalation_level} due to operator acknowledgement.`
                          : `SLA deadline passed. Escalation level ${lead.escalation_level} triggered. Automated notifications sent to management.`)
                      : 'Lead is actively being worked. SLA countdown is running.'}
                  </p>
                </div>
              </div>

              {/* Escalation Journey */}
              <EscalationJourney level={lead.escalation_level} deadline={lead.response_deadline} />

              {/* SLA Breach timestamp */}
              {lead.sla_breached_at && (
                <div className="p-3 bg-red-950/20 border border-red-500/20 rounded-lg">
                  <span className="text-[9px] font-bold text-red-400 uppercase tracking-widest flex items-center gap-1.5">
                    <AlertCircle className="w-3 h-3" /> SLA Breached At
                  </span>
                  <p className="font-mono text-[11px] text-red-300 mt-1">
                    {new Date(lead.sla_breached_at).toLocaleString()}
                  </p>
                </div>
              )}
            </div>

            {/* RIGHT: Event Timeline (2 cols) */}
            <div className="col-span-2 p-6 space-y-4 bg-[#0A0A0A]">
              <div className="flex items-center justify-between">
                <h4 className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">
                  Operational Event Stream
                </h4>
                <span className="text-[8px] font-mono text-zinc-600">
                  {events.length} events
                </span>
              </div>
              <EventTimeline events={events} isLoading={eventsLoading} />
            </div>
          </div>
        </div>

        {/* ── FOOTER ── */}
        <div className="px-6 py-3 border-t border-[#1F1F1F] bg-[#0E0E0E] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <span className="text-[9px] text-zinc-600 font-mono uppercase tracking-widest">
              Source: <span className="text-zinc-400">{lead.source}</span>
            </span>
            {lead.last_contacted_at && (
              <span className="text-[9px] text-zinc-600 font-mono uppercase tracking-widest">
                Last Contact: <span className="text-zinc-400">{new Date(lead.last_contacted_at).toLocaleDateString()}</span>
              </span>
            )}
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="text-[9px] font-bold text-zinc-500 hover:text-[#FAFAFA] uppercase tracking-widest transition-colors px-3 py-1 rounded border border-[#262626] hover:border-[#404040]"
          >
            Close
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
