'use client';

import { useState, useEffect } from 'react';
import { updateLeadStatus, deleteLead, acknowledgeAlert } from '@/app/actions/leads';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { MoreVertical, Trash, AlertCircle, TrendingDown, Zap, ShieldAlert, Clock, AlertTriangle } from 'lucide-react';
import { DecayStatus } from '@/lib/orchestration';
import { SLAStatus } from '@/lib/sla';

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
  response_deadline: string | null;
  sla_status: SLAStatus;
  sla_breached_at: string | null;
  created_at: string;
};

interface LeadDashboardProps {
  leads: Lead[];
  onLeadsChange: (leads: Lead[]) => void;
  onLeadSelect?: (lead: Lead) => void;
}

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
        const minutes = Math.floor(diff / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeLeft(`${minutes}:${seconds.toString().padStart(2, '0')}`);
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

export default function LeadDashboard({ leads, onLeadsChange, onLeadSelect }: LeadDashboardProps) {
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [leadToDelete, setLeadToDelete] = useState<Lead | null>(null);

  const handleStatusChange = async (id: string, newStatus: string) => {
    setUpdatingId(id);
    const result = await updateLeadStatus(id, newStatus);
    if (result.success) {
      toast.success('Status synchronized');
      onLeadsChange(leads.map(lead => lead.id === id ? { ...lead, status: newStatus } : lead));
    } else {
      toast.error('Failed to update status');
    }
    setUpdatingId(null);
  };

  const confirmDelete = async () => {
    if (!leadToDelete) return;
    
    const result = await deleteLead(leadToDelete.id);
    if (result.success) {
      toast.success('Lead record terminated');
      onLeadsChange(leads.filter(lead => lead.id !== leadToDelete.id));
    } else {
      toast.error('Termination failed');
    }
    setLeadToDelete(null);
  };

  const handleAcknowledge = async (id: string) => {
    const result = await acknowledgeAlert(id);
    if (result.success) {
      toast.success('Alert acknowledged. Escalation paused.');
      onLeadsChange(leads.map(lead => lead.id === id ? { ...lead, escalation_level: 0 } : lead));
    } else {
      toast.error('Failed to acknowledge alert');
    }
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
    <div className="bg-[#0A0A0A] border border-[#262626] rounded-md overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-[#111111]">
            <TableRow className="border-[#262626] hover:bg-transparent">
              <TableHead className="text-[10px] uppercase font-bold text-muted-foreground py-2">Lead / Intelligence</TableHead>
              <TableHead className="text-[10px] uppercase font-bold text-muted-foreground py-2">SLA Status</TableHead>
              <TableHead className="text-[10px] uppercase font-bold text-muted-foreground py-2">Score</TableHead>
              <TableHead className="text-[10px] uppercase font-bold text-muted-foreground py-2">Decay</TableHead>
              <TableHead className="text-[10px] uppercase font-bold text-muted-foreground py-2">Status</TableHead>
              <TableHead className="text-[10px] uppercase font-bold text-muted-foreground py-2 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.length === 0 ? (
              <TableRow className="border-[#262626]">
                <TableCell colSpan={6} className="h-32 text-center text-[11px] text-muted-foreground">
                  NO ACTIVE LEADS IN QUEUE
                </TableCell>
              </TableRow>
            ) : (
              leads.map((lead) => (
                <TableRow 
                  key={lead.id} 
                  className="border-[#262626] hover:bg-[#111111]/50 cursor-pointer transition-colors group"
                  onClick={() => onLeadSelect?.(lead)}
                >
                  <TableCell className="py-2">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold text-[#FAFAFA]">{lead.name}</span>
                        {lead.is_duplicate && (
                          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/20 text-[9px] font-bold text-red-500 uppercase">
                            <ShieldAlert className="w-2.5 h-2.5" /> Duplicate
                          </div>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground font-mono">{lead.source}</span>
                    </div>
                  </TableCell>
                  <TableCell className="py-2">
                    <SLATimer deadline={lead.response_deadline} status={lead.status} />
                  </TableCell>
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
                  <TableCell className="py-2">
                    <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] font-bold border ${getDecayColor(lead.decay_status)}`}>
                      {lead.decay_status === 'HOT' && <Zap className="w-2.5 h-2.5 fill-current" />}
                      {lead.decay_status === 'HIGH_RISK' && <AlertCircle className="w-2.5 h-2.5" />}
                      {lead.decay_status}
                    </div>
                  </TableCell>
                  <TableCell className="py-2" onClick={(e) => e.stopPropagation()}>
                    <Select 
                      value={lead.status} 
                      onValueChange={(val) => val && val !== lead.status && handleStatusChange(lead.id, val)}
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
                  <TableCell className="py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {lead.status === 'New Lead' && lead.sla_status === 'BREACHED' && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={(e) => { e.stopPropagation(); handleAcknowledge(lead.id); }}
                          className="h-6 text-[9px] font-bold uppercase tracking-tighter bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/20 hover:text-red-400"
                        >
                          Acknowledge
                        </Button>
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
                          <DropdownMenuItem 
                            className="text-[11px] font-medium text-red-500 focus:text-red-500 focus:bg-red-500/10 cursor-pointer"
                            onClick={(e) => { e.stopPropagation(); setLeadToDelete(lead); }}
                          >
                            <Trash className="w-3.5 h-3.5 mr-2" /> Delete Operation
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!leadToDelete} onOpenChange={(open) => !open && setLeadToDelete(null)}>
        <DialogContent className="bg-[#0A0A0A] border border-[#262626] text-[#FAFAFA] sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-500 uppercase tracking-tighter italic font-black text-xl">
              <ShieldAlert className="w-5 h-5" />
              Operational Warning
            </DialogTitle>
            <DialogDescription className="text-muted-foreground uppercase text-[10px] tracking-widest font-bold mt-2">
              Are you sure you want to terminate this lead record?
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
              Terminate Operation
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
