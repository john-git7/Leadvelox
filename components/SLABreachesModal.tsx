'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { getBreachedLeads } from '@/app/actions/leads';
import { ArrowRight, AlertTriangle, Clock, ShieldAlert } from 'lucide-react';

export function SLABreachesModal({ textClass }: { textClass: string }) {
  const [open, setOpen] = useState(false);
  const [breaches, setBreaches] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const handleOpenChange = async (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      setLoading(true);
      const data = await getBreachedLeads();
      setBreaches(data);
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        className={`flex items-center gap-1.5 shrink-0 text-[10px] font-bold uppercase tracking-widest ${textClass} hover:opacity-80 transition-opacity`}
      >
        View Escalations
        <ArrowRight className="w-3 h-3" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl bg-[#0A0A0A] border-[#262626] text-[#FAFAFA] p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-4 border-b border-[#262626] bg-[#111111]">
          <DialogTitle className="flex items-center gap-2 text-lg font-black uppercase tracking-tight text-red-500">
            <AlertTriangle className="w-5 h-5" />
            SLA Breach Analysis
          </DialogTitle>
          <p className="text-[11px] text-muted-foreground uppercase tracking-widest font-bold mt-1">
            Immediate R&D and Escalation Required
          </p>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto p-6 bg-[#0A0A0A]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground animate-pulse">
              <Clock className="w-8 h-8 mb-4 opacity-50" />
              <p className="text-[11px] font-bold uppercase tracking-wider">Fetching Escalation Data...</p>
            </div>
          ) : breaches.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-emerald-500">
              <p className="text-[11px] font-bold uppercase tracking-wider">No Active Breaches Found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {breaches.map((lead) => {
                const breachedAt = new Date(lead.sla_breached_at);
                const hoursAgo = Math.floor((new Date().getTime() - breachedAt.getTime()) / (1000 * 60 * 60));
                return (
                  <div key={lead.id} className="p-4 rounded-lg bg-[#111111] border border-red-500/20 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-red-500" />
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 pl-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-[#FAFAFA]">{lead.name}</span>
                          <span className="text-[10px] text-muted-foreground font-mono bg-[#1A1A1A] px-1.5 py-0.5 rounded border border-[#262626]">
                            {lead.email}
                          </span>
                        </div>
                        <p className="text-[11px] text-red-400 font-bold uppercase tracking-wider mt-1">
                          Breached {hoursAgo}h ago
                        </p>
                      </div>
                      <div className="flex flex-col gap-2 text-[10px] md:text-right mt-3 md:mt-0">
                        <div className="flex justify-between md:justify-end items-center gap-4 border-b border-[#262626] pb-1">
                          <span className="text-muted-foreground uppercase tracking-wider font-bold">Received:</span>
                          <span className="font-mono text-[#FAFAFA]">{new Date(lead.created_at).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between md:justify-end items-center gap-4 border-b border-[#262626] pb-1">
                          <span className="text-muted-foreground uppercase tracking-wider font-bold">SLA Deadline:</span>
                          <span className="font-mono text-[#FAFAFA]">{lead.response_deadline ? new Date(lead.response_deadline).toLocaleString() : 'N/A'}</span>
                        </div>
                        <div className="flex justify-between md:justify-end items-center gap-4">
                          <span className="text-muted-foreground uppercase tracking-wider font-bold">Overdue By:</span>
                          <span className="font-mono text-red-400 font-bold">{hoursAgo}h {Math.floor(((new Date().getTime() - breachedAt.getTime()) % (1000 * 60 * 60)) / (1000 * 60))}m</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
