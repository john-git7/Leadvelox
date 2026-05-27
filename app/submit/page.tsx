import LeadCaptureForm from '@/components/LeadCaptureForm';
import Link from 'next/link';

/**
 * Public lead intake endpoint.
 * This is where you direct demo leads and real intake URLs.
 * Decoupled from the marketing homepage so the home page can be buyer-facing.
 */
export default function SubmitLeadPage() {
  return (
    <main className="min-h-screen bg-[#0A0A0A] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md mx-auto space-y-8">
        <div className="text-center space-y-2">
          <Link href="/" className="inline-flex items-center gap-2 mb-4">
            <div className="w-5 h-5 bg-[#FAFAFA] rounded-sm flex items-center justify-center">
              <div className="w-2.5 h-2.5 bg-[#0A0A0A] rounded-full" />
            </div>
            <span className="text-xs font-black tracking-tighter uppercase text-[#FAFAFA]">LeadVelox</span>
          </Link>
          <h1 className="text-3xl font-black text-[#FAFAFA] uppercase italic tracking-tight">
            Submit a Lead
          </h1>
          <p className="text-muted-foreground text-[12px] uppercase font-bold tracking-widest">
            Secure intake portal
          </p>
        </div>

        <div className="p-8 rounded-lg bg-[#111111] border border-[#262626] shadow-2xl">
          <LeadCaptureForm />
        </div>

        <p className="text-center text-[9px] text-muted-foreground font-mono uppercase tracking-widest leading-relaxed">
          Supabase-backed · Inngest-powered · Webhook retry enabled
        </p>
      </div>
    </main>
  );
}
