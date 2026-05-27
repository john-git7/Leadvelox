'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { LogOut, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export function LogoutButton() {
  const [pending, setPending] = useState(false);
  const router = useRouter();

  const handleLogout = async () => {
    setPending(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <Button
      variant="ghost"
      onClick={handleLogout}
      disabled={pending}
      className="h-8 text-[11px] font-bold text-muted-foreground hover:text-[#FAFAFA] hover:bg-[#111111] transition-all"
    >
      {pending ? (
        <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
      ) : (
        <LogOut className="w-3.5 h-3.5 mr-2" />
      )}
      {pending ? 'TERMINATING...' : 'TERMINATE SESSION'}
    </Button>
  );
}
