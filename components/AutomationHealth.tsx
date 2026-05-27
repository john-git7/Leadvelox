'use client';

import { useState } from 'react';
import { Activity } from 'lucide-react';
import { InfoTooltip } from '@/components/ui/info-tooltip';

type AutomationEvent = {
  id: string;
  workflow_name: string;
  status: 'Success' | 'Failed' | 'Retrying' | 'Pending';
  duration_ms?: number;
  error_message?: string;
  created_at: string;
};

export default function AutomationHealth({ events }: { events: AutomationEvent[] }) {
  const [filter, setFilter] = useState<'All' | 'Success' | 'Failed' | 'Retrying' | 'Pending'>('All');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 5;
  const stats = {
    success: events.filter(e => e.status === 'Success').length,
    failed: events.filter(e => e.status === 'Failed').length,
    retrying: events.filter(e => e.status === 'Retrying').length,
    pending: events.filter(e => e.status === 'Pending').length,
    total: events.length
  };

  const completed = stats.success + stats.failed;
  const successRate = completed > 0 ? Math.round((stats.success / completed) * 100) : 100;
  const monitorLabel = stats.retrying > 0
    ? `${stats.retrying} retrying`
    : stats.pending > 0
      ? `${stats.pending} awaiting callback`
      : `${successRate}% callback success`;

  const filteredEvents = events.filter(e => filter === 'All' || e.status === filter);
  const displayedEvents = filteredEvents.slice(0, page * PAGE_SIZE);

  return (
    <div className="bg-[#0A0A0A] border border-[#262626] rounded-lg overflow-hidden shadow-2xl flex flex-col max-h-[500px]">
      <div className="p-4 border-b border-[#262626] flex justify-between items-start sm:items-center bg-[#111111] shrink-0">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-green-500" />
            <h3 className="text-[10px] font-bold text-[#FAFAFA] uppercase tracking-widest flex items-center">
              Automation Monitor
              <InfoTooltip content="Tracking the real-time sync of your leads to external systems." />
            </h3>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <select 
            className="bg-[#0A0A0A] border border-[#262626] text-[9px] uppercase font-bold text-[#FAFAFA] p-1 rounded"
            value={filter}
            onChange={(e) => { setFilter(e.target.value as typeof filter); setPage(1); }}
          >
            <option value="All">ALL STATUS</option>
            <option value="Success">SUCCESS</option>
            <option value="Failed">FAILED</option>
            <option value="Retrying">RETRYING</option>
            <option value="Pending">PENDING CALLBACK</option>
          </select>
          <div className={`w-1.5 h-1.5 rounded-full ${stats.retrying > 0 || stats.failed > 0 ? 'bg-yellow-500' : 'bg-green-500'} animate-pulse`} />
          <span className="text-[9px] font-bold text-muted-foreground uppercase">{monitorLabel}</span>
        </div>
      </div>
      
      <div className="p-4 space-y-4 overflow-y-auto flex-1">
        {filteredEvents.length === 0 ? (
          <p className="text-[10px] text-muted-foreground text-center py-4 uppercase font-bold tracking-tighter">No events match filter</p>
        ) : (
          displayedEvents.map((event) => (
            <div key={event.id} className="flex items-center justify-between group">
              <div className="flex items-center gap-3">
                <div className={`w-1.5 h-1.5 rounded-full ${
                  event.status === 'Success' ? 'bg-green-500' : 
                  event.status === 'Failed' ? 'bg-red-500' : 
                  event.status === 'Retrying' ? 'bg-yellow-500 animate-spin' :
                  'bg-blue-500 animate-pulse'
                }`} />
                <div className="flex flex-col">
                  <span className="text-[11px] font-bold text-[#FAFAFA] uppercase tracking-tight">{event.workflow_name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] text-muted-foreground font-mono">
                      {new Date(event.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                    {event.duration_ms && (
                      <span className="text-[9px] text-blue-400 font-bold font-mono tracking-tighter">
                        {event.duration_ms}ms
                      </span>
                    )}
                  </div>
                  {event.error_message && (
                    <span className="text-[9px] text-red-400 font-mono truncate max-w-[150px] mt-0.5">{event.error_message}</span>
                  )}
                </div>
              </div>
              <div className={`px-1.5 py-0.5 rounded border text-[8px] font-black uppercase ${
                event.status === 'Success' ? 'text-green-500 border-green-500/20 bg-green-500/5' :
                event.status === 'Failed' ? 'text-red-500 border-red-500/20 bg-red-500/5' :
                event.status === 'Retrying' ? 'text-yellow-500 border-yellow-500/20 bg-yellow-500/5' :
                'text-blue-400 border-blue-500/20 bg-blue-500/5'
              }`}>
                {event.status === 'Pending' ? 'Awaiting callback' : event.status}
              </div>
            </div>
          ))
        )}
        
        {displayedEvents.length < filteredEvents.length && (
          <button 
            onClick={() => setPage(p => p + 1)}
            className="w-full mt-4 py-2 border border-[#262626] bg-[#111111] hover:bg-[#171717] rounded text-[10px] font-bold text-muted-foreground uppercase transition-colors"
          >
            Load More Events ({filteredEvents.length - displayedEvents.length} remaining)
          </button>
        )}
      </div>
    </div>
  );
}
