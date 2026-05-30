'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { 
  Zap, 
  Clock, 
  Globe, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle, 
  Code, 
  Copy, 
  Check, 
  User 
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

type AutomationEvent = {
  id: string;
  lead_id?: string;
  workflow_name: string;
  status: 'Success' | 'Failed' | 'Retrying' | 'Pending';
  duration_ms?: number;
  error_message?: string;
  created_at: string;
  payload?: any;
  endpoint_url?: string;
  retry_count?: number;
  next_retry_at?: string;
};

interface AutomationEventModalProps {
  event: AutomationEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectLead: (leadId: string) => void;
}

export default function AutomationEventModal({
  event,
  open,
  onOpenChange,
  onSelectLead
}: AutomationEventModalProps) {
  const [copied, setCopied] = useState(false);

  if (!event) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(event.payload ?? {}, null, 2));
    setCopied(true);
    toast.success('Payload copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const statusColors = {
    Success: 'border-emerald-500/30 text-emerald-400 bg-emerald-500/5',
    Failed: 'border-red-500/30 text-red-400 bg-red-500/5',
    Retrying: 'border-yellow-500/30 text-yellow-400 bg-yellow-500/5',
    Pending: 'border-blue-500/30 text-blue-400 bg-blue-500/5'
  };

  const statusIcons = {
    Success: <CheckCircle className="w-4 h-4 text-emerald-400" />,
    Failed: <AlertTriangle className="w-4 h-4 text-red-400" />,
    Retrying: <RefreshCw className="w-4 h-4 text-yellow-400 animate-spin" />,
    Pending: <Clock className="w-4 h-4 text-blue-400 animate-pulse" />
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl bg-[#0A0A0A] border-[#262626] text-[#FAFAFA] p-0 overflow-hidden shadow-2xl animate-in fade-in duration-300">
        
        {/* HEADER BAR */}
        <DialogHeader className="p-6 pb-4 border-b border-[#262626] bg-[#111111] flex flex-col gap-1">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <Zap className="w-5 h-5 text-blue-500" />
              <DialogTitle className="text-base font-black uppercase tracking-tight text-white">
                Workflow execution audit
              </DialogTitle>
            </div>
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-[9px] font-black uppercase tracking-wider ${statusColors[event.status]}`}>
              {statusIcons[event.status]}
              {event.status === 'Pending' ? 'Awaiting Callback' : event.status}
            </div>
          </div>
          <DialogDescription className="text-[10px] text-zinc-500 uppercase tracking-widest font-black mt-2">
            Details for ID: {event.id}
          </DialogDescription>
        </DialogHeader>

        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto bg-[#0A0A0A] text-sm">
          
          {/* TOP METADATA GRID */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="p-3 bg-[#111111] border border-[#262626] rounded-md flex flex-col gap-1">
              <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
                <Clock className="w-3 h-3" />
                Execution time
              </span>
              <span className="font-mono text-[11px] text-[#FAFAFA] mt-1">
                {new Date(event.created_at).toLocaleString()}
              </span>
            </div>

            <div className="p-3 bg-[#111111] border border-[#262626] rounded-md flex flex-col gap-1">
              <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
                <Clock className="w-3 h-3" />
                Latency / Duration
              </span>
              <span className="font-mono text-[11px] text-[#FAFAFA] mt-1">
                {event.duration_ms ? `${event.duration_ms}ms` : '—'}
              </span>
            </div>

            <div className="p-3 bg-[#111111] border border-[#262626] rounded-md col-span-2 sm:col-span-1 flex flex-col gap-1">
              <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
                <RefreshCw className="w-3 h-3" />
                Retry context
              </span>
              <span className="font-mono text-[11px] text-[#FAFAFA] mt-1">
                Attempt #{event.retry_count ?? 0}
              </span>
            </div>
          </div>

          {/* ENDPOINT URL TARGET */}
          {event.endpoint_url && (
            <div className="p-3.5 bg-[#111111] border border-[#262626] rounded-md space-y-1.5">
              <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
                <Globe className="w-3 h-3" />
                Outgoing webhook endpoint
              </span>
              <div className="font-mono text-[10px] bg-[#0A0A0A] border border-[#1F1F1F] p-2 rounded text-[#FAFAFA] break-all">
                {event.endpoint_url}
              </div>
            </div>
          )}

          {/* ERROR STATUS BLOCK */}
          {event.status === 'Failed' && event.error_message && (
            <div className="p-3.5 bg-red-950/20 border border-red-500/20 rounded-md space-y-1.5 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-red-500" />
              <span className="text-[9px] font-bold text-red-400 uppercase tracking-widest flex items-center gap-1.5 pl-1.5">
                <AlertTriangle className="w-3 h-3" />
                Failure reason & logs
              </span>
              <div className="font-mono text-[10px] bg-[#0A0A0A] border border-red-500/10 p-2 rounded text-red-300 pl-1.5 whitespace-pre-wrap">
                {event.error_message}
              </div>
            </div>
          )}

          {/* RETRY SCHEDULE SECTION */}
          {event.status === 'Retrying' && event.next_retry_at && (
            <div className="p-3.5 bg-yellow-950/20 border border-yellow-500/20 rounded-md space-y-1.5 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-yellow-500" />
              <span className="text-[9px] font-bold text-yellow-400 uppercase tracking-widest flex items-center gap-1.5 pl-1.5">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Next retry schedule
              </span>
              <div className="font-mono text-[10px] bg-[#0A0A0A] border border-yellow-500/10 p-2 rounded text-yellow-300 pl-1.5">
                Will execute at: {new Date(event.next_retry_at).toLocaleString()}
              </div>
            </div>
          )}

          {/* PAYLOAD INSPECTOR */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
                <Code className="w-3.5 h-3.5" />
                Webhook payload data
              </span>
              <Button
                size="sm"
                onClick={handleCopy}
                className="h-6 px-2 text-[9px] font-bold uppercase tracking-wider bg-[#111111] border border-[#262626] hover:bg-[#1a1a1a]"
              >
                {copied ? <Check className="w-3 h-3 mr-1 text-emerald-400" /> : <Copy className="w-3 h-3 mr-1" />}
                Copy payload
              </Button>
            </div>
            <div className="bg-[#111111] border border-[#262626] rounded-md overflow-hidden">
              <pre className="p-4 text-[10px] font-mono overflow-x-auto text-zinc-300 max-h-[250px] scrollbar-thin">
                <code>{JSON.stringify(event.payload ?? {}, null, 2)}</code>
              </pre>
            </div>
          </div>
        </div>

        {/* FOOTER & NAVIGATION ACTIONS */}
        <div className="p-4 bg-[#111111] border-t border-[#262626] flex items-center justify-between gap-3">
          <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold">
            Workflow: {event.workflow_name}
          </span>
          {event.lead_id && (
            <Button
              size="sm"
              onClick={() => {
                onSelectLead(event.lead_id!);
                onOpenChange(false);
              }}
              className="bg-blue-500 hover:bg-blue-600 text-white font-bold text-[9px] uppercase tracking-wider h-8"
            >
              <User className="w-3.5 h-3.5 mr-1.5" />
              View lead context
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
