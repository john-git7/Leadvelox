import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, Save } from 'lucide-react';
import { getSystemSettings, updateSystemSettings } from '@/app/actions/leads';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/server';
import { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Settings | LeadVelox',
  description: 'Configure agency SLA and notification settings.',
};

export default async function SettingsPage() {
  // Role guard — only ADMIN and MANAGER may access this page.
  // AGENT users are redirected back to the Command Center.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    const role = profile?.role;
    if (role !== 'ADMIN' && role !== 'MANAGER') {
      redirect('/dashboard');
    }
  }

  const settings = await getSystemSettings();

  async function saveSettings(formData: FormData) {
    'use server';
    await updateSystemSettings(formData);
    redirect('/dashboard');
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-[10px] font-bold text-zinc-500 uppercase tracking-widest hover:text-zinc-300 transition-colors mb-3"
        >
          <ArrowLeft className="h-3 w-3" />
          Command Center
        </Link>
        <h1 className="text-4xl font-black tracking-tight uppercase leading-none italic">
          Agency <span className="text-muted-foreground">Settings</span>
        </h1>
        <p className="text-sm text-zinc-400 mt-2 max-w-xl">
          Configure operational parameters for this agency account: SLA timing, business hours, and revenue assumptions.
        </p>
      </div>

      <form action={saveSettings} className="max-w-3xl bg-[#111111] border border-[#262626] rounded-lg p-6 space-y-6">
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="agency_name" className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Agency Name
            </Label>
            <Input
              id="agency_name"
              name="agency_name"
              defaultValue={settings.agency_name ?? ''}
              placeholder="Acme Realty Group"
              className="bg-[#0A0A0A] border-[#262626] text-[#FAFAFA]"
            />
          </div>


          <div className="space-y-2">
            <Label htmlFor="sla_response_minutes" className="text-[10px] uppercase tracking-widest text-muted-foreground">
              First Response SLA Minutes
            </Label>
            <Input
              id="sla_response_minutes"
              name="sla_response_minutes"
              type="number"
              min="1"
              defaultValue={settings.sla_response_minutes ?? 5}
              className="bg-[#0A0A0A] border-[#262626] text-[#FAFAFA]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ack_suppression_minutes" className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Acknowledgement Suppression Minutes
            </Label>
            <Input
              id="ack_suppression_minutes"
              name="ack_suppression_minutes"
              type="number"
              min="1"
              defaultValue={settings.ack_suppression_minutes ?? 30}
              className="bg-[#0A0A0A] border-[#262626] text-[#FAFAFA]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="avg_deal_value" className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Average Commission Value
            </Label>
            <Input
              id="avg_deal_value"
              name="avg_deal_value"
              type="number"
              min="1"
              defaultValue={settings.avg_deal_value ?? 1200}
              className="bg-[#0A0A0A] border-[#262626] text-[#FAFAFA]"
            />
          </div>

          <label className="flex items-center gap-3 rounded-md border border-[#262626] bg-[#0A0A0A] px-3 py-2 mt-6">
            <input
              name="enforce_business_hours"
              type="checkbox"
              defaultChecked={settings.enforce_business_hours ?? true}
              className="h-4 w-4 accent-green-500"
            />
            <span className="text-[11px] font-bold uppercase tracking-widest text-[#FAFAFA]">
              Enforce 9AM-5PM ET business hours
            </span>
          </label>
        </div>

        <div className="flex justify-end border-t border-[#262626] pt-5">
          <Button type="submit" className="bg-[#FAFAFA] text-[#0A0A0A] hover:bg-zinc-200 font-bold text-[10px] uppercase tracking-widest">
            <Save className="h-3.5 w-3.5 mr-2" />
            Save Settings
          </Button>
        </div>
      </form>
    </div>
  );
}
