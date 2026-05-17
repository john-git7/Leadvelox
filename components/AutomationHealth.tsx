'use client';

import { CheckCircle2, XCircle, AlertCircle, RefreshCw, Activity } from 'lucide-react';

type AutomationEvent = {
  id: string;
  workflow_name: string;
  status: 'Success' | 'Failed' | 'Retrying' | 'Pending';
  duration_ms?: number;
  error_message?: string;
  created_at: string;
};

export default function AutomationHealth({ events }: { events: AutomationEvent[] }) {
  const stats = {
    success: events.filter(e => e.status === 'Success').length,
    failed: events.filter(e => e.status === 'Failed').length,
    total: events.length
  };

  const successRate = stats.total > 0 ? Math.round((stats.success / stats.total) * 100) : 100;

  return (
    <div className="bg-[#0A0A0A] border border-[#262626] rounded-lg overflow-hidden shadow-2xl">
      <div className="p-4 border-b border-[#262626] flex justify-between items-center bg-[#111111]">
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-green-500" />
          <h3 className="text-[10px] font-bold text-[#FAFAFA] uppercase tracking-widest">Automation Monitor</h3>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full ${successRate > 90 ? 'bg-green-500' : 'bg-yellow-500'} animate-pulse`} />
          <span className="text-[9px] font-bold text-muted-foreground uppercase">{successRate}% Health</span>
        </div>
      </div>
      
      <div className="p-4 space-y-4">
        {events.length === 0 ? (
          <p className="text-[10px] text-muted-foreground text-center py-4 uppercase font-bold tracking-tighter">System Idle / Listening</p>
        ) : (
          events.slice(0, 5).map((event) => (
            <div key={event.id} className="flex items-center justify-between group">
              <div className="flex items-center gap-3">
                <div className={`w-1.5 h-1.5 rounded-full ${
                  event.status === 'Success' ? 'bg-green-500' : 
                  event.status === 'Failed' ? 'bg-red-500' : 
                  'bg-yellow-500 animate-spin'
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
                'text-yellow-500 border-yellow-500/20 bg-yellow-500/5'
              }`}>
                {event.status}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
