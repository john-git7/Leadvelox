"use client";

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

const faqs = [
  {
    q: "How is this different from just using a CRM?",
    a: "Most CRMs record what happened in the past. LeadVelox tells you what's about to go wrong right now. It sits on top of your CRM as an operational monitor to enforce accountability and speed-to-lead."
  },
  {
    q: "How does a lead get into the system?",
    a: "Your website form, ad landing pages (Zillow, Facebook, etc.), or any source that can send a webhook. We connect it during setup so leads instantly flow into LeadVelox."
  },
  {
    q: "Do you send the automated emails or do we?",
    a: "Your team sends the personalized relationship emails. What LeadVelox does is track the response time, fire the internal escalation alerts to management, and make sure no lead is ignored."
  },
  {
    q: "What happens if our webhooks or notifications fail?",
    a: "The system has a built-in safety net. If a system goes down, it queues the events and retries automatically. Nothing is permanently lost."
  },
  {
    q: "How long does setup take?",
    a: "Once you pay the initial $525, we deploy your instance within 48 hours. The onboarding call takes about 45 minutes to configure your specific SLA response rules."
  },
  {
    q: "Am I locked into a long-term contract?",
    a: "Absolutely not. The monthly retainer is month-to-month. If you feel the platform isn't paying for itself in saved deals, you can cancel at any time with no penalties."
  }
];

export function FAQAccordion() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div className="space-y-4">
      {faqs.map((faq, i) => (
        <div key={i} className="border border-[#262626] bg-[#0A0A0A] rounded-lg overflow-hidden transition-colors hover:border-[#404040]">
          <button 
            className="w-full px-6 py-5 flex items-center justify-between text-left focus:outline-none"
            onClick={() => toggle(i)}
          >
            <h3 className="text-[14px] font-bold text-[#FAFAFA] pr-8">{faq.q}</h3>
            <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform duration-200 shrink-0 ${openIndex === i ? 'rotate-180' : ''}`} />
          </button>
          
          <div 
            className={`px-6 overflow-hidden transition-all duration-300 ease-in-out ${openIndex === i ? 'max-h-40 pb-5 opacity-100' : 'max-h-0 opacity-0'}`}
          >
            <div className="pt-4 border-t border-[#262626]">
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                {faq.a}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
