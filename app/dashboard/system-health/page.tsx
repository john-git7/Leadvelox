import { getSystemHealthMetrics } from '@/app/actions/health';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, AlertTriangle, CheckCircle, Clock, ServerCrash } from 'lucide-react';

export const metadata = {
  title: 'System Health | Operations',
};

export default async function SystemHealthPage() {
  const metrics = await getSystemHealthMetrics();

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
          <Activity className="h-8 w-8 text-blue-500" />
          System Health
        </h1>
        <p className="text-zinc-400 mt-2">
          Real-time operational reliability and webhook orchestration metrics.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Workflow Success Rate</CardTitle>
            <CheckCircle className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{metrics.successRatio}%</div>
            <p className="text-xs text-zinc-500 mt-1">Avg Duration: {metrics.avgDurationMs}ms</p>
          </CardContent>
        </Card>
        
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Pending Retries</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{metrics.retryCount}</div>
            <p className="text-xs text-zinc-500 mt-1">Queued for exponential backoff</p>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Total Failures</CardTitle>
            <ServerCrash className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{metrics.failureCount}</div>
            <p className="text-xs text-zinc-500 mt-1">Permanent webhook failures</p>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Active SLA Breaches</CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{metrics.activeBreaches}</div>
            <p className="text-xs text-zinc-500 mt-1">Unresponded leads past deadline</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-zinc-100">Active Retry Queue</CardTitle>
            <CardDescription className="text-zinc-400">Webhooks waiting for the next backoff cycle.</CardDescription>
          </CardHeader>
          <CardContent>
            {metrics.activeRetries.length === 0 ? (
              <div className="text-sm text-zinc-500 py-4 text-center">No pending retries. System is healthy.</div>
            ) : (
              <div className="space-y-4">
                {metrics.activeRetries.map((retry) => (
                  <div key={retry.id} className="flex items-center justify-between p-3 rounded-lg border border-zinc-800 bg-zinc-950/50">
                    <div>
                      <div className="font-medium text-zinc-200 text-sm">{retry.workflow_name}</div>
                      <div className="text-xs text-zinc-500">Attempt {retry.retry_count + 1} • {retry.leads?.name || 'Unknown Lead'}</div>
                    </div>
                    <div className="text-right">
                      <Badge variant="outline" className="text-yellow-500 border-yellow-500/20 bg-yellow-500/10">Retrying</Badge>
                      <div className="text-xs text-zinc-500 mt-1">Next: {new Date(retry.next_retry_at).toLocaleTimeString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-zinc-100">Critical Escalations</CardTitle>
            <CardDescription className="text-zinc-400">Recent high-severity operational events.</CardDescription>
          </CardHeader>
          <CardContent>
            {metrics.escalationEvents.length === 0 ? (
              <div className="text-sm text-zinc-500 py-4 text-center">No recent escalations.</div>
            ) : (
              <div className="space-y-4">
                {metrics.escalationEvents.map((event) => (
                  <div key={event.id} className="flex gap-3 text-sm p-3 rounded-lg border border-zinc-800 bg-zinc-950/50">
                    <div className="mt-0.5">
                      {event.severity === 'CRITICAL' ? (
                        <ServerCrash className="h-4 w-4 text-red-500" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-orange-500" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-zinc-200 flex items-center justify-between">
                        {event.event_type}
                        <span className="text-xs text-zinc-500 font-normal">{new Date(event.created_at).toLocaleTimeString()}</span>
                      </div>
                      <div className="text-zinc-400 mt-1">{event.description}</div>
                      {event.leads && (
                        <div className="text-xs text-zinc-500 mt-2 border-t border-zinc-800 pt-2">
                          Lead: {event.leads.name}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
