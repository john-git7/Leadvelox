# Lead Ops Intelligence Platform — Setup Guide

## Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project (free tier works for development)
- A [Vercel](https://vercel.com) account for deployment
- An [Inngest](https://inngest.com) account for the retry queue
- An [n8n](https://n8n.io) instance (self-hosted or cloud) for workflow automation

---

## 1. Clone & Install

```bash
git clone <your-repo-url>
cd lead-automation
npm install
```

---

## 2. Environment Variables

Copy the example file and fill in your values:

```bash
cp .env.local.example .env.local
```

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase service role key (never expose client-side) |
| `N8N_WEBHOOK_URL` | ✅ | n8n intake webhook URL (dev) |
| `N8N_PROD_WEBHOOK_URL` | ✅ prod | n8n intake webhook URL (production) |
| `N8N_WEBHOOK_SECRET` | ✅ prod | HMAC secret for n8n callback verification. Generate: `openssl rand -hex 32` |
| `CRON_SECRET` | ✅ prod | Bearer token for the Vercel cron endpoint. Generate: `openssl rand -hex 32` |
| `INNGEST_EVENT_KEY` | ✅ | Inngest event key |
| `INNGEST_SIGNING_KEY` | ✅ | Inngest signing key |
| `NEXT_PUBLIC_BOOKING_URL` | ✅ | Calendly/Cal.com booking link for the landing page CTAs |
| `NEXT_PUBLIC_SENTRY_DSN` | Optional | Sentry DSN for error monitoring (create a project at sentry.io) |
| `SENTRY_AUTH_TOKEN` | Optional | Sentry auth token for source map uploads |
| `INNGEST_DEV` | Dev only | Set to `1` in local dev to use Inngest Dev Server |

---

## 3. Database Setup

Run the following SQL files **in order** using the Supabase SQL Editor
(Dashboard → SQL Editor → New Query → paste → Run):

| Step | File | Description |
|---|---|---|
| 1 | `supabase/schema.sql` | Core tables: leads, lead_events, automation_events, profiles, lead_groups |
| 2 | `supabase/migration_settings.sql` | system_settings table and default row |
| 3 | `supabase/migration_settings_v2.sql` | Adds agency_name and notification_target columns |
| 4 | `supabase/migration_operational.sql` | lead_groups identity, cron_heartbeat, webhook retry columns, insert_lead_intake RPC |
| 5 | `supabase/migration_fixes.sql` | rate_limits, performance indices, escalation_thresholds, sla_response_minutes |
| 6 | `supabase/migration_fixes_v2.sql` | duration_ms on automation_events, lead search index, additional fixes |
| 7 | `supabase/migration_production_audit.sql` | profiles table (RBAC), user_role enum, rate_limits RLS lockdown |
| 8 | `supabase/008_fix_rls_policies.sql` | Replaces FOR ALL policies with explicit least-privilege grants |

> [!IMPORTANT]
> Steps must be run in order. Each migration is idempotent (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`) so re-running is safe, but out-of-order runs can fail due to missing dependencies.

> [!TIP]
> After running all migrations, verify the setup by navigating to the Supabase Table Editor and confirming these tables exist: `leads`, `lead_events`, `automation_events`, `profiles`, `lead_groups`, `rate_limits`, `system_settings`, `cron_heartbeat`.

---

## 4. Create Your First User

In the Supabase Dashboard → Authentication → Users, invite yourself. Then run this SQL to set your role:

```sql
INSERT INTO profiles (id, role)
VALUES ('<your-user-id>', 'ADMIN')
ON CONFLICT (id) DO UPDATE SET role = 'ADMIN';
```

Replace `<your-user-id>` with your UUID from the Users table.

---

## 5. Supabase Realtime

Enable Realtime for these tables in Supabase Dashboard → Database → Replication:

- `leads`
- `lead_events`
- `automation_events`

---

## 6. Local Development

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000).

For Inngest local development, start the Inngest Dev Server in a separate terminal:

```bash
npx inngest-cli@latest dev
```

---

## 7. Deploy to Vercel

```bash
vercel deploy --prod
```

Configure all environment variables from Step 2 in the Vercel dashboard under Project → Settings → Environment Variables.

### Vercel Cron Setup

Add the following to `vercel.json` in your project root (create if it doesn't exist):

```json
{
  "crons": [
    {
      "path": "/api/cron/sla",
      "schedule": "* * * * *"
    }
  ]
}
```

The cron will automatically inject `Authorization: Bearer <CRON_SECRET>` if you set `CRON_SECRET` in Vercel environment variables.

> [!WARNING]
> The Vercel cron at `/api/cron/sla` is the **sole SLA escalation driver**. Do not enable any Inngest SLA cron — the Inngest `retryQueue` function is the only active Inngest job.

---

## 8. n8n Workflow Configuration

1. Create a new n8n workflow triggered by a Webhook node
2. Set the webhook URL as `N8N_WEBHOOK_URL` (dev) and `N8N_PROD_WEBHOOK_URL` (prod)
3. At the end of the workflow, POST a callback to `/api/orchestration/complete` with:
   ```json
   {
     "orchestration_id": "{{ $json.orchestration_id }}",
     "lead_id": "{{ $json.lead_id }}",
     "status": "success",
     "delivery_status": "delivered",
     "provider": "email"
   }
   ```
4. Set the `X-Webhook-Signature` header in n8n to the HMAC-SHA256 signature of the request body using `N8N_WEBHOOK_SECRET`

---

## 9. Per-Client Deployment Checklist

When onboarding a new client:

- [ ] Create a new Supabase project
- [ ] Run all 8 migrations in order
- [ ] Create the client's ADMIN user account
- [ ] Set `NEXT_PUBLIC_BOOKING_URL` to the client's scheduling link (or your own)
- [ ] Set `N8N_WEBHOOK_URL` / `N8N_PROD_WEBHOOK_URL` to the client's n8n instance
- [ ] Generate fresh `N8N_WEBHOOK_SECRET` and `CRON_SECRET` for this client
- [ ] Configure `system_settings` via the Settings page: agency name, notification target, SLA minutes
- [ ] Deploy to Vercel with client-specific environment variables
- [ ] Verify the Inngest Dev Server / production Inngest app is connected
- [ ] Test the full intake flow: submit a lead → n8n fires → callback received → event timeline shows completion

---

## 10. Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| SLA cron heartbeat is stale (>5min) | Vercel cron not running or `CRON_SECRET` mismatch | Check Vercel cron logs; verify env var matches |
| Leads not appearing in dashboard | Supabase Realtime not enabled | Enable Realtime for `leads` table in Supabase dashboard |
| n8n webhook callbacks returning 401 | `N8N_WEBHOOK_SECRET` mismatch | Regenerate and sync the secret in both Vercel and n8n |
| "Unauthorized" on dashboard | Session expired or profiles row missing | Re-login; confirm your user has a row in `profiles` table |
| Duplicate events in timeline | Dual cron was running | Confirm only the Vercel HTTP cron is active; Inngest slaCheck should not exist |
