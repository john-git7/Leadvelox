import Link from 'next/link';
import { AlertTriangle, Clock, Zap, ArrowRight, CheckCircle2, XCircle } from 'lucide-react';

export default function Home() {
  const bookingUrl = process.env.NEXT_PUBLIC_BOOKING_URL ?? '#';
  return (
    <main className="min-h-screen bg-[#0A0A0A] text-[#FAFAFA]">

      {/* NAV */}
      <nav className="border-b border-[#262626] px-6 md:px-16 py-4 flex items-center justify-between sticky top-0 bg-[#0A0A0A]/95 backdrop-blur-sm z-50">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 bg-[#FAFAFA] rounded-sm flex items-center justify-center">
            <div className="w-2.5 h-2.5 bg-[#0A0A0A] rounded-full" />
          </div>
          <span className="text-xs font-black tracking-tighter uppercase text-[#FAFAFA]">LeadVelox</span>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/login"
            className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground hover:text-[#FAFAFA] transition-colors"
          >
            Client Login
          </Link>
          <a
            href={bookingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 bg-[#FAFAFA] text-[#0A0A0A] rounded text-[11px] font-black uppercase tracking-widest hover:bg-[#e0e0e0] transition-colors"
          >
            Book Demo <ArrowRight className="w-3 h-3" />
          </a>
        </div>
      </nav>

      {/* HERO */}
      <section className="px-6 md:px-16 pt-20 pb-16 max-w-5xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 mb-8 text-[10px] font-bold tracking-widest uppercase border border-red-500/30 rounded-sm bg-red-500/5 text-red-400">
          <AlertTriangle className="w-3 h-3" /> Lead leakage is costing real estate agencies $5k–$50k/year
        </div>

        <h1 className="text-5xl md:text-7xl font-black tracking-tighter leading-[0.9] italic uppercase mb-6">
          Stop Losing Leads<br />
          <span className="text-muted-foreground">To Slow Response.</span>
        </h1>

        <p className="text-base md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
          Know <strong className="text-[#FAFAFA]">within minutes</strong> when a lead goes uncontacted.
          Get alerted before they call your competitor.
          See exactly where your team is dropping the ball — in real time.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href={bookingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-8 py-4 bg-[#FAFAFA] text-[#0A0A0A] rounded text-[12px] font-black uppercase tracking-widest hover:bg-[#e0e0e0] transition-colors w-full sm:w-auto justify-center"
          >
            Book a 15-Minute Demo <ArrowRight className="w-4 h-4" />
          </a>
          <Link
            href="/login"
            className="flex items-center gap-2 px-8 py-4 border border-[#262626] bg-[#111111] text-muted-foreground rounded text-[12px] font-black uppercase tracking-widest hover:text-[#FAFAFA] hover:border-[#404040] transition-colors w-full sm:w-auto justify-center"
          >
            Client Login
          </Link>
        </div>

        <p className="mt-6 text-[11px] text-muted-foreground font-mono">
          Setup: <strong className="text-[#FAFAFA]">$1,000 one-time</strong> · Monthly: <strong className="text-[#FAFAFA]">$200/month</strong> · No contract
        </p>
      </section>

      {/* THE PROBLEM */}
      <section className="px-6 md:px-16 py-16 border-y border-[#262626] bg-[#111111]">
        <div className="max-w-4xl mx-auto">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-6 text-center">The Problem</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                stat: '78%',
                label: 'of deals go to the first agent to respond',
                icon: Zap,
                color: 'text-orange-500',
                bg: 'bg-orange-500/10',
                border: 'border-orange-500/20',
              },
              {
                stat: '10 min',
                label: 'is the window before lead intent drops dramatically',
                icon: Clock,
                color: 'text-red-500',
                bg: 'bg-red-500/10',
                border: 'border-red-500/20',
              },
              {
                stat: '40%',
                label: 'of online leads receive no response within an hour',
                icon: AlertTriangle,
                color: 'text-yellow-500',
                bg: 'bg-yellow-500/10',
                border: 'border-yellow-500/20',
              },
            ].map((item, i) => (
              <div key={i} className={`p-6 rounded-lg border ${item.border} ${item.bg}`}>
                <div className={`text-4xl font-black tracking-tighter mb-2 ${item.color}`}>{item.stat}</div>
                <p className="text-[12px] text-muted-foreground leading-relaxed">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS — DEMO SCENARIO */}
      <section className="px-6 md:px-16 py-20 max-w-4xl mx-auto">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-4 text-center">How It Works</p>
        <h2 className="text-3xl md:text-4xl font-black tracking-tighter text-center mb-14 uppercase italic">
          From Lead In to Alert Out — <span className="text-muted-foreground">In Under 60 Seconds</span>
        </h2>

        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-6 top-0 bottom-0 w-px bg-[#262626] hidden md:block" />

          <div className="space-y-0">
            {[
              { step: '01', event: 'Lead submits inquiry', detail: 'From Zillow, website, Facebook, or any source', color: 'text-[#FAFAFA]', dot: 'bg-[#FAFAFA]' },
              { step: '02', event: 'SLA timer starts immediately', detail: 'Response deadline set based on your business hours', color: 'text-blue-400', dot: 'bg-blue-500' },
              { step: '03', event: '5 minutes pass. No contact.', detail: 'Platform detects the response gap in real time', color: 'text-yellow-400', dot: 'bg-yellow-500' },
              { step: '04', event: 'SLA breach triggered', detail: 'Lead escalated to HIGH priority in the dashboard', color: 'text-orange-400', dot: 'bg-orange-500' },
              { step: '05', event: 'Alert fires to your inbox', detail: 'Email (or Slack) with lead name, source, and time overdue', color: 'text-red-400', dot: 'bg-red-500 animate-pulse' },
              { step: '06', event: 'Operational event logged', detail: 'Full audit trail: who saw what, when, and what happened next', color: 'text-green-400', dot: 'bg-green-500' },
            ].map((item, i) => (
              <div key={i} className="flex gap-6 md:gap-10 pb-8 relative">
                <div className="flex flex-col items-center shrink-0">
                  <div className={`w-3 h-3 rounded-full ${item.dot} z-10 mt-1 ring-4 ring-[#0A0A0A]`} />
                </div>
                <div className="pb-2">
                  <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest font-mono">{item.step}</span>
                  <p className={`text-[15px] font-bold mt-0.5 ${item.color}`}>{item.event}</p>
                  <p className="text-[12px] text-muted-foreground mt-1">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WHAT'S INCLUDED */}
      <section className="px-6 md:px-16 py-16 bg-[#111111] border-y border-[#262626]">
        <div className="max-w-4xl mx-auto">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-4 text-center">Productized Service</p>
          <h2 className="text-3xl font-black tracking-tighter text-center uppercase italic mb-12">What You Get</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Setup */}
            <div className="p-6 bg-[#0A0A0A] border border-[#262626] rounded-lg space-y-4">
              <div>
                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-1">One-Time Setup</p>
                <p className="text-4xl font-black tracking-tighter text-[#FAFAFA]">$1,000</p>
              </div>
              <div className="border-t border-[#262626] pt-4 space-y-2.5">
                {[
                  'Platform deployment to your domain',
                  'SLA configuration for your business hours',
                  'Email + Slack alert workflows',
                  'Lead intake setup (your sources)',
                  'Duplicate detection enabled',
                  'Automation health monitoring',
                  'Full onboarding call (1 hour)',
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0" />
                    <span className="text-[12px] text-muted-foreground">{item}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-[#262626] pt-4 space-y-2">
                {[
                  'Unlimited custom features',
                  'CRM migration',
                  'Mobile app',
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <XCircle className="w-3.5 h-3.5 text-[#404040] mt-0.5 shrink-0" />
                    <span className="text-[11px] text-[#404040] line-through">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Monthly */}
            <div className="p-6 bg-[#0A0A0A] border border-[#FAFAFA]/10 rounded-lg space-y-4 ring-1 ring-[#FAFAFA]/5">
              <div>
                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Monthly Retainer</p>
                <p className="text-4xl font-black tracking-tighter text-[#FAFAFA]">$200<span className="text-lg text-muted-foreground font-bold">/mo</span></p>
              </div>
              <div className="border-t border-[#262626] pt-4 space-y-2.5">
                {[
                  'Uptime supervision and monitoring',
                  'Workflow maintenance and updates',
                  'Bug fixes and operational tuning',
                  'Alert workflow adjustments',
                  'Monthly ops summary report',
                  '1 support call/month included',
                  'New lead source connections',
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0" />
                    <span className="text-[12px] text-muted-foreground">{item}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-[#262626] pt-4 space-y-2">
                {[
                  '24/7 on-call engineering',
                  'Unlimited feature requests',
                  'Full-time support staff',
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <XCircle className="w-3.5 h-3.5 text-[#404040] mt-0.5 shrink-0" />
                    <span className="text-[11px] text-[#404040] line-through">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ROI CALCULATOR — STATIC */}
      <section className="px-6 md:px-16 py-20 max-w-3xl mx-auto text-center">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-4">The Math</p>
        <h2 className="text-3xl font-black tracking-tighter uppercase italic mb-8">
          One Recovered Deal Pays For <span className="text-muted-foreground">2+ Years</span>
        </h2>
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: 'Avg commission', value: '$9,000' },
            { label: 'Annual cost', value: '$3,400' },
            { label: 'Breakeven', value: '0.4 deals' },
          ].map((item, i) => (
            <div key={i} className="p-4 bg-[#111111] border border-[#262626] rounded-lg">
              <p className="text-2xl font-black tracking-tighter text-[#FAFAFA]">{item.value}</p>
              <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest mt-1">{item.label}</p>
            </div>
          ))}
        </div>
        <p className="text-[13px] text-muted-foreground">
          If you close <strong className="text-[#FAFAFA]">one additional deal per year</strong> because you responded faster,
          this system pays for itself <strong className="text-[#FAFAFA]">2.6x over</strong>.
        </p>
      </section>

      {/* CTA */}
      <section className="px-6 md:px-16 py-16 bg-[#111111] border-t border-[#262626]">
        <div className="max-w-2xl mx-auto text-center space-y-6">
          <h2 className="text-4xl font-black tracking-tighter uppercase italic">
            Ready to Stop <span className="text-muted-foreground">Losing Leads?</span>
          </h2>
          <p className="text-muted-foreground text-sm">
            15-minute demo. No slides. We show you the live system handling a real lead in real time.
          </p>
          <a
            href={bookingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-10 py-4 bg-[#FAFAFA] text-[#0A0A0A] rounded text-[12px] font-black uppercase tracking-widest hover:bg-[#e0e0e0] transition-colors"
          >
            Book Your Demo <ArrowRight className="w-4 h-4" />
          </a>
          <p className="text-[10px] text-muted-foreground font-mono">
            $1,000 setup · $200/month · No contract · Cancel anytime
          </p>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="px-6 md:px-16 py-8 border-t border-[#262626] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-[#FAFAFA] rounded-sm flex items-center justify-center">
            <div className="w-2 h-2 bg-[#0A0A0A] rounded-full" />
          </div>
          <span className="text-[10px] font-black tracking-tighter uppercase text-muted-foreground">LeadVelox</span>
        </div>
        <p className="text-[10px] text-muted-foreground font-mono">
          Operational infrastructure for real estate agencies
        </p>
      </footer>

    </main>
  );
}
