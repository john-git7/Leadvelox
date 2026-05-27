'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function LivePresence() {
  const [currentUser, setCurrentUser] = useState<{ email?: string, id?: string } | null>(null);
  const [onlineCount, setOnlineCount] = useState(1);

  useEffect(() => {
    const supabase = createClient();
    const presenceChannel = supabase.channel('global-presence');

    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setCurrentUser({ email: data.user.email, id: data.user.id });
        
        presenceChannel
          .on('presence', { event: 'sync' }, () => {
            const state = presenceChannel.presenceState();
            const uniqueUsers = new Set();
            for (const id in state) {
              const presences = state[id] as any[];
              for (const p of presences) {
                if (p.user_id) uniqueUsers.add(p.user_id);
              }
            }
            setOnlineCount(Math.max(1, uniqueUsers.size));
          })
          .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
              await presenceChannel.track({ user_id: data.user.id, email: data.user.email });
            }
          });
      }
    });

    return () => {
      void supabase.removeChannel(presenceChannel);
    };
  }, []);

  if (!currentUser) return null;

  return (
    <div className="hidden sm:flex items-center gap-4 bg-[#111111] border border-[#262626] rounded-full px-4 py-1.5 shadow-sm mr-4">
      <div className="flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
        <span className="text-[10px] font-bold text-[#FAFAFA] uppercase tracking-widest">
          {onlineCount} {onlineCount === 1 ? 'Agent' : 'Agents'} Active
        </span>
      </div>
      <div className="w-px h-3 bg-[#262626]" />
      <span className="text-[10px] font-mono text-muted-foreground truncate max-w-[150px]">
        {currentUser.email?.split('@')[0]}
      </span>
    </div>
  );
}
