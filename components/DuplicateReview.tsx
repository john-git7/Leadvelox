'use client';

import { useCallback, useEffect, useState } from 'react';
import { ShieldAlert, CheckCircle, Archive } from 'lucide-react';
import { getPotentialDuplicates, resolveDuplicate, bulkDeleteLeads } from '@/app/actions/leads';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';

type DuplicateLead = {
  id: string;
  name: string;
  email: string;
  phone: string;
  source: string;
  created_at: string;
  duplicate_reason?: string;
};

export default function DuplicateReview() {
  const [duplicates, setDuplicates] = useState<DuplicateLead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const loadDuplicates = useCallback(async () => {
    setIsLoading(true);
    const data = await getPotentialDuplicates();
    setDuplicates(data as DuplicateLead[]);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void loadDuplicates();
    });

    const supabase = createClient();
    const channel = supabase.channel('duplicate-review-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
        void loadDuplicates();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadDuplicates]);

  const handleResolve = async (id: string, action: 'archive' | 'separate') => {
    setResolvingId(id);
    const result = await resolveDuplicate(id, action);
    if (result.success) {
      toast.success(`Duplicate record ${action === 'archive' ? 'archived' : 'separated'}`);
      setDuplicates(prev => prev.filter(d => d.id !== id));
    } else {
      toast.error('Failed to resolve duplicate');
    }
    setResolvingId(null);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setIsBulkDeleting(true);
    const result = await bulkDeleteLeads(Array.from(selectedIds));
    if (result.success) {
      toast.success(`Deleted ${selectedIds.size} duplicates.`);
      setDuplicates(prev => prev.filter(d => !selectedIds.has(d.id)));
      setSelectedIds(new Set());
    } else {
      toast.error(result.error || 'Bulk delete failed. Check permissions.');
    }
    setIsBulkDeleting(false);
  };

  const toggleSelection = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleAll = () => {
    if (selectedIds.size === duplicates.length && duplicates.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(duplicates.map(d => d.id)));
    }
  };

  if (isLoading) {
    return null; // Or a skeleton loader
  }

  if (duplicates.length === 0) {
    return (
      <div className="bg-[#111111] border border-[#262626] rounded-lg p-6 shadow-2xl space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b border-[#262626]">
          <ShieldAlert className="w-5 h-5 text-muted-foreground" />
          <h2 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Duplicate Review Queue</h2>
        </div>
        <div className="text-center py-6 text-[11px] text-muted-foreground">
          NO PENDING DUPLICATES
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#111111] border border-blue-500/20 rounded-lg p-6 shadow-2xl space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b border-[#262626]">
        <input 
          type="checkbox" 
          checked={duplicates.length > 0 && selectedIds.size === duplicates.length}
          onChange={toggleAll}
          className="accent-blue-500 cursor-pointer"
        />
        <ShieldAlert className="w-5 h-5 text-blue-400 ml-2" />
        <h2 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Duplicate Review Queue</h2>
        <div className="px-1.5 py-0.5 bg-blue-500/10 text-blue-400 text-[9px] font-black rounded border border-blue-500/20">
          {duplicates.length} PENDING
        </div>
        
        {selectedIds.size > 0 && (
          <Button
            size="sm"
            onClick={handleBulkDelete}
            disabled={isBulkDeleting}
            className="ml-auto h-7 text-[9px] font-bold uppercase tracking-widest bg-red-950/80 text-red-400 border border-red-500 hover:bg-red-900"
          >
            {isBulkDeleting ? 'Deleting...' : 'Delete Selected'}
          </Button>
        )}
        
        <div className={`${selectedIds.size > 0 ? 'ml-2' : 'ml-auto'} text-[9px] font-mono text-zinc-500 bg-[#0A0A0A] border border-[#262626] rounded px-2 py-1`}>
          SORT: NEWEST
        </div>
      </div>

      <div className="space-y-3">
        {duplicates.map(dup => (
          <div key={dup.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 bg-[#0A0A0A] border border-[#262626] rounded gap-4">
            <div className="flex flex-col w-full">
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-3">
                  <input 
                    type="checkbox" 
                    checked={selectedIds.has(dup.id)}
                    onChange={() => toggleSelection(dup.id)}
                    className="accent-blue-500 cursor-pointer"
                  />
                  <h3 className="text-sm font-semibold truncate text-white">{dup.name}</h3>
                </div>
                <div className="flex gap-2 items-center">
                  {dup.duplicate_reason && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded border bg-amber-500/10 border-amber-500/20 text-amber-500 font-medium whitespace-nowrap">
                      Match: {dup.duplicate_reason}
                    </span>
                  )}
                  <Badge variant="outline" className="text-[10px] border-white/10 text-white/60 uppercase tracking-widest whitespace-nowrap">{dup.source}</Badge>
                </div>
              </div>
              <span className="text-[10px] text-muted-foreground font-mono">{dup.email} | {dup.phone}</span>
            </div>
            
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button 
                onClick={() => handleResolve(dup.id, 'separate')}
                disabled={resolvingId === dup.id}
                size="sm"
                title="Treat this as a completely new, unique lead and add it to the main queue"
                className="flex-1 sm:flex-none h-7 bg-[#111111] border border-[#262626] text-muted-foreground hover:text-[#FAFAFA] text-[9px] font-bold uppercase tracking-wider"
              >
                <CheckCircle className="w-3 h-3 mr-1.5" /> Separate
              </Button>
              <Button 
                onClick={() => handleResolve(dup.id, 'archive')}
                disabled={resolvingId === dup.id}
                size="sm"
                title="Discard this duplicate so it doesn't clutter your pipeline"
                className="flex-1 sm:flex-none h-7 bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 text-[9px] font-bold uppercase tracking-wider"
              >
                <Archive className="w-3 h-3 mr-1.5" /> Archive
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
