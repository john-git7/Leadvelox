'use client';

import { useState, useEffect } from 'react';
import { ShieldAlert, CheckCircle, Archive } from 'lucide-react';
import { getPotentialDuplicates, resolveDuplicate } from '@/app/actions/leads';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function DuplicateReview() {
  const [duplicates, setDuplicates] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  useEffect(() => {
    loadDuplicates();
  }, []);

  const loadDuplicates = async () => {
    setIsLoading(true);
    const data = await getPotentialDuplicates();
    setDuplicates(data);
    setIsLoading(false);
  };

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

  if (isLoading || duplicates.length === 0) {
    return null; // Do not render if there's nothing to review
  }

  return (
    <div className="bg-[#111111] border border-blue-500/20 rounded-lg p-6 shadow-2xl space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b border-[#262626]">
        <ShieldAlert className="w-5 h-5 text-blue-400" />
        <h2 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Duplicate Review Queue</h2>
        <div className="px-1.5 py-0.5 bg-blue-500/10 text-blue-400 text-[9px] font-black rounded border border-blue-500/20">
          {duplicates.length} PENDING
        </div>
      </div>

      <div className="space-y-3">
        {duplicates.map(dup => (
          <div key={dup.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 bg-[#0A0A0A] border border-[#262626] rounded gap-4">
            <div className="flex flex-col">
              <span className="text-[12px] font-bold text-[#FAFAFA]">{dup.name}</span>
              <span className="text-[10px] text-muted-foreground font-mono">{dup.email} | {dup.phone}</span>
            </div>
            
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button 
                onClick={() => handleResolve(dup.id, 'separate')}
                disabled={resolvingId === dup.id}
                size="sm"
                className="flex-1 sm:flex-none h-7 bg-[#111111] border border-[#262626] text-muted-foreground hover:text-[#FAFAFA] text-[9px] font-bold uppercase tracking-wider"
              >
                <CheckCircle className="w-3 h-3 mr-1.5" /> Separate
              </Button>
              <Button 
                onClick={() => handleResolve(dup.id, 'archive')}
                disabled={resolvingId === dup.id}
                size="sm"
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
