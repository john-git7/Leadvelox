import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { ArrowLeft } from 'lucide-react';

export default function TermsOfService() {
  return (
    <main className="min-h-screen bg-[#0A0A0A] text-[#FAFAFA] selection:bg-[#FAFAFA] selection:text-[#0A0A0A]">
      <nav className="border-b border-[#262626] px-6 md:px-16 py-4 flex items-center justify-between sticky top-0 bg-[#0A0A0A]/95 backdrop-blur-sm z-50">
        <Link href="/" className="flex items-center gap-1 group">
          <Logo className="h-7 w-auto text-[#FAFAFA] group-hover:text-muted-foreground transition-colors" />
          <span className="text-xs font-black tracking-tighter uppercase text-[#FAFAFA] group-hover:text-muted-foreground transition-colors">LeadVelox</span>
        </Link>
        <Link href="/" className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground hover:text-[#FAFAFA] transition-colors">
          <ArrowLeft className="w-3 h-3" /> Back to Home
        </Link>
      </nav>

      <article className="max-w-3xl mx-auto px-6 py-16 md:py-24 prose prose-invert prose-zinc">
        <h1 className="text-4xl font-black tracking-tighter uppercase italic mb-8">Terms of Service</h1>
        <p className="text-sm text-muted-foreground mb-12">Last Updated: June 2026</p>

        <h2 className="text-xl font-bold tracking-tight mt-12 mb-4 text-[#FAFAFA]">1. Acceptance of Terms</h2>
        <p className="text-muted-foreground leading-relaxed mb-6">
          By accessing or using the LeadVelox platform, you agree to be bound by these Terms of Service. If you do not agree to these terms, you may not access or use the platform.
        </p>

        <h2 className="text-xl font-bold tracking-tight mt-12 mb-4 text-[#FAFAFA]">2. Description of Service</h2>
        <p className="text-muted-foreground leading-relaxed mb-6">
          LeadVelox provides operational infrastructure and lead response tracking tools for real estate agencies. The service includes real-time SLA tracking, automated escalation workflows, and performance analytics. We reserve the right to modify or discontinue any part of the service at any time.
        </p>

        <h2 className="text-xl font-bold tracking-tight mt-12 mb-4 text-[#FAFAFA]">3. User Responsibilities</h2>
        <p className="text-muted-foreground leading-relaxed mb-6">
          You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You agree not to use the platform for any unlawful purpose or in any way that violates these Terms. You must ensure that any data you input into the system complies with applicable data protection laws.
        </p>

        <h2 className="text-xl font-bold tracking-tight mt-12 mb-4 text-[#FAFAFA]">4. Payment Terms</h2>
        <p className="text-muted-foreground leading-relaxed mb-6">
          LeadVelox is provided on a subscription basis. By subscribing, you agree to pay all applicable fees, including setup fees and monthly recurring charges, as outlined during the signup process. Subscription fees are non-refundable unless otherwise specified in writing.
        </p>

        <h2 className="text-xl font-bold tracking-tight mt-12 mb-4 text-[#FAFAFA]">5. Limitation of Liability</h2>
        <p className="text-muted-foreground leading-relaxed mb-6">
          In no event shall LeadVelox or its creators be liable for any indirect, incidental, special, consequential, or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from your access to or use of or inability to access or use the service.
        </p>

        <h2 className="text-xl font-bold tracking-tight mt-12 mb-4 text-[#FAFAFA]">6. Governing Law</h2>
        <p className="text-muted-foreground leading-relaxed mb-6">
          These Terms shall be governed by and construed in accordance with the laws of the jurisdiction in which the company is registered, without regard to its conflict of law provisions.
        </p>
      </article>

      <footer className="px-6 md:px-16 py-8 border-t border-[#262626] flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Logo className="h-7 w-auto text-muted-foreground" />
          <span className="text-[10px] font-black tracking-tighter uppercase text-muted-foreground">LeadVelox</span>
        </div>
        <p className="text-[10px] text-muted-foreground font-mono">
          Operational infrastructure for real estate agencies
        </p>
      </footer>
    </main>
  );
}
