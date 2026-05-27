import { getSystemHealthMetrics } from '@/app/actions/health';
import { getIntegrationHealth } from '@/app/actions/integrations';
import SystemHealthDashboard from '@/components/SystemHealthDashboard';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'System Health | LeadVelox',
  description: 'Real-time operational reliability and webhook orchestration metrics.',
};

export default async function SystemHealthPage() {
  // Parallel fetch — both queries race; page still renders if one fails
  const [metrics, integrationHealth] = await Promise.all([
    getSystemHealthMetrics().catch(() => null),
    getIntegrationHealth().catch(() => null),
  ]);

  return (
    <SystemHealthDashboard 
      initialMetrics={metrics} 
      initialIntegration={integrationHealth} 
    />
  );
}
