import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { ArrowLeft } from 'lucide-react';

export default function PrivacyPolicy() {
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
        <h1 className="text-4xl font-black tracking-tighter uppercase italic mb-8">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-12">Last Updated: June 2026</p>

        <h2 className="text-xl font-bold tracking-tight mt-12 mb-4 text-[#FAFAFA]">1. Information We Collect</h2>
        <p className="text-muted-foreground leading-relaxed mb-6">
          When you use LeadVelox, we collect information that you provide directly to us, such as your name, email address, phone number, and billing information. We also collect information automatically when you use our platform, including log data, device information, and usage metrics.
        </p>

        <h2 className="text-xl font-bold tracking-tight mt-12 mb-4 text-[#FAFAFA]">2. How We Use Your Information</h2>
        <p className="text-muted-foreground leading-relaxed mb-6">
          We use the information we collect to provide, maintain, and improve our services, to process transactions, to send you technical notices and support messages, and to communicate with you about products, services, offers, and events.
        </p>

        <h2 className="text-xl font-bold tracking-tight mt-12 mb-4 text-[#FAFAFA]">3. Data Processing and Subprocessors</h2>
        <p className="text-muted-foreground leading-relaxed mb-6">
          As an operational infrastructure platform, we process lead data on your behalf. We use trusted third-party subprocessors to deliver our services (such as hosting providers and communication APIs). We ensure all subprocessors adhere to strict data protection standards.
        </p>

        <h2 className="text-xl font-bold tracking-tight mt-12 mb-4 text-[#FAFAFA]">4. Data Security</h2>
        <p className="text-muted-foreground leading-relaxed mb-6">
          We implement appropriate technical and organizational measures to protect the security of your personal information. However, please note that no transmission of data over the internet is guaranteed to be completely secure.
        </p>

        <h2 className="text-xl font-bold tracking-tight mt-12 mb-4 text-[#FAFAFA]">5. Your Rights</h2>
        <p className="text-muted-foreground leading-relaxed mb-6">
          You have the right to access, update, or delete your personal information. You may also object to our processing of your personal information or request that we restrict the processing of your personal information. To exercise these rights, please contact our support team.
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
