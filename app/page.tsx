import LeadCaptureForm from '@/components/LeadCaptureForm';
import { Radio, Zap, ShieldCheck, Activity } from 'lucide-react';

export default function Home() {
  return (
    <main className="flex-1 flex flex-col lg:flex-row min-h-screen bg-[#0A0A0A]">
      {/* Left side: Hero / Branding */}
      <div className="flex-1 flex flex-col justify-center px-6 md:px-16 py-16 md:py-24 lg:border-r border-[#262626] relative overflow-hidden">
        {/* Subtle Background Pattern */}
        <div className="absolute inset-0 opacity-5 pointer-events-none">
          <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(#FAFAFA 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>
        </div>

        <div className="max-w-xl mx-auto lg:mx-0 text-center lg:text-left relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-8 text-[10px] md:text-xs font-bold tracking-widest uppercase border border-[#262626] rounded-sm bg-[#111111] text-muted-foreground">
            <Radio className="w-3 h-3 text-green-500 animate-pulse" /> Operational Infrastructure
          </div>
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-black tracking-tighter text-[#FAFAFA] mb-6 leading-[0.9] italic uppercase">
            Reduce <span className="text-muted-foreground">Lead Loss</span> <br />
            Through Operational Intelligence.
          </h1>
          <p className="text-base md:text-lg text-muted-foreground mb-10 max-w-md mx-auto lg:mx-0 leading-relaxed">
            Monitor response delays, workflow failures, and lead decay in real-time. Professional-grade infrastructure for high-velocity sales teams.
          </p>
          
          <div className="grid grid-cols-2 gap-6 max-w-sm mx-auto lg:mx-0">
            {[
              { label: 'SLA Engine', icon: Activity, color: 'text-blue-500' },
              { label: 'Workflow Health', icon: Zap, color: 'text-orange-500' },
              { label: 'Deduplication', icon: ShieldCheck, color: 'text-green-500' },
              { label: 'Real-time Ops', icon: Radio, color: 'text-red-500' },
            ].map((feature, i) => (
              <div key={i} className="flex items-center gap-3">
                <feature.icon className={`w-4 h-4 ${feature.color}`} />
                <span className="text-[10px] font-black uppercase tracking-widest text-[#FAFAFA]">{feature.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right side: Lead Capture Form */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-16 bg-[#111111] border-l border-[#262626]">
        <div className="w-full max-w-md mx-auto">
          <div className="mb-10 text-center lg:text-left">
            <div className="flex items-center gap-2 mb-4 justify-center lg:justify-start">
              <div className="w-6 h-6 bg-[#FAFAFA] rounded-sm flex items-center justify-center">
                <div className="w-3 h-3 bg-[#0A0A0A] rounded-full" />
              </div>
              <span className="text-xs font-bold tracking-tighter uppercase text-[#FAFAFA]">Deployment Intake</span>
            </div>
            <h2 className="text-3xl font-black text-[#FAFAFA] mb-2 tracking-tight uppercase italic">Secure <span className="text-muted-foreground">Access</span></h2>
            <p className="text-muted-foreground text-xs uppercase font-bold tracking-widest">Submit record for operational processing.</p>
          </div>
          <div className="p-8 rounded-lg bg-[#0A0A0A] border border-[#262626] shadow-2xl">
            <LeadCaptureForm />
          </div>
          <p className="mt-8 text-center lg:text-left text-[9px] text-muted-foreground font-mono uppercase tracking-widest leading-relaxed">
            Supabase-backed persistence <br />
            Inngest-powered cron engine <br />
            Webhook retry with exponential backoff
          </p>
        </div>
      </div>
    </main>
  );
}
