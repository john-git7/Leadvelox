import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const poppins = Poppins({
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-poppins",
});

export const metadata: Metadata = {
  title: "LeadVelox | The Operational Monitor for Study Abroad Consultancies",
  description: "Know within minutes when a lead goes uncontacted. Stop losing leads to slow response with our premium operational infrastructure.",
  keywords: [
    "study abroad lead response",
    "speed to lead overseas education",
    "consultancy accountability software",
    "lead leakage study abroad",
    "operational monitor for agencies",
    "student lead follow up tracker",
    "SLA monitor for admissions"
  ],
  icons: {
    icon: '/icon.svg',
  },
  // To verify Google Search Console, you will add your code here:
  // verification: {
  //   google: 'YOUR_GSC_VERIFICATION_CODE',
  // },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${poppins.variable} h-full antialiased dark bg-[#0A0A0A] text-[#FAFAFA] font-sans`}
    >
      <body className="min-h-full flex flex-col">
        {/* Google Schema.org structured data to tell Google what your logo is */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              "name": "LeadVelox",
              "url": "https://leadvelox.xyz",
              "logo": "https://leadvelox.xyz/logo.svg"
            })
          }}
        />
        {children}
        <Toaster theme="dark" />
      </body>
    </html>
  );
}
