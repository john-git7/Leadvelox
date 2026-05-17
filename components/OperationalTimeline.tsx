'use client';

import { Activity, Clock, AlertTriangle, ShieldCheck, Mail, Info, ShieldAlert } from 'lucide-react';
import { EventSeverity } from '@/lib/sla';

type Event = {
  id: string;
  event_type: string;
  description: string;
  severity: EventSeverity;
  created_at: string;
};

export default function OperationalTimeline({ events }: { events: Event[] }) {
  const getIcon = (type: string, severity: EventSeverity) => {
    if (severity === 'CRITICAL' || severity === 'HIGH') {
      return <ShieldAlert className="w-4 h-4 text-red-500" />;
    }

    switch (type.toLowerCase()) {
      case 'intake': return <ShieldCheck className="w-4 h-4 text-green-500" />;
      case 'status change': return <Activity className="w-4 h-4 text-blue-400" />;
      case 'sla breach': return <AlertTriangle className="w-4 h-4 text-red-500" />;
      case 'automation': return <Mail className="w-4 h-4 text-purple-400" />;
      case 'workflow': return <Info className="w-4 h-4 text-blue-500" />;
      default: return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getSeverityStyle = (severity: EventSeverity) => {
    switch (severity) {
      case 'CRITICAL': return 'border-red-500/50 bg-red-500/5';
      case 'HIGH': return 'border-orange-500/50 bg-orange-500/5';
      case 'MEDIUM': return 'border-yellow-500/50 bg-yellow-500/5';
      default: return 'border-[#262626]';
    }
  };

  return (
    <div className="space-y-6">
      <h3 className="text-sm font-semibold text-[#FAFAFA] uppercase tracking-wider">Operational Event Stream</h3>
      <div className="relative space-y-8 before:absolute before:inset-0 before:ml-5 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-[#262626] before:via-[#262626] before:to-transparent">
        {events.length === 0 ? (
          <p className="text-xs text-muted-foreground pl-12">No operational events recorded.</p>
        ) : (
          events.map((event) => (
            <div key={event.id} className="relative flex items-start pl-12 group">
              <div className={`absolute left-0 flex items-center justify-center w-10 h-10 rounded-full bg-[#111111] border shadow-sm group-hover:border-[#404040] transition-colors ${getSeverityStyle(event.severity)}`}>
                {getIcon(event.event_type, event.severity)}
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(event.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {event.severity !== 'INFO' && (
                    <span className={`text-[8px] font-bold px-1 rounded border ${
                      event.severity === 'CRITICAL' ? 'text-red-500 border-red-500/20 bg-red-500/10' :
                      event.severity === 'HIGH' ? 'text-orange-500 border-orange-500/20 bg-orange-500/10' :
                      'text-yellow-500 border-yellow-500/20 bg-yellow-500/10'
                    }`}>
                      {event.severity}
                    </span>
                  )}
                </div>
                <span className="text-sm font-medium text-[#FAFAFA]">{event.event_type}</span>
                <p className="text-xs text-muted-foreground mt-0.5">{event.description}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
