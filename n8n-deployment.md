# n8n Production Deployment Guide

To transition from a local n8n setup to a production-ready operational infrastructure, follow these instructions.

## 1. Choose a Hosting Provider

For high reliability and operational integrity, we recommend:
- **Railway**: Easiest setup, automatic SSL, and scaling.
- **Hetzner (Self-hosted)**: Most cost-effective, high performance, full control.

### Railway Deployment (Recommended)
1. Use the [n8n Railway Template](https://railway.app/template/n8n).
2. Set the following Environment Variables in Railway:
   - `N8N_ENCRYPTION_KEY`: A secure random string.
   - `WEBHOOK_URL`: Your Railway deployment URL (e.g., `https://n8n-production.up.railway.app/`).
3. Connect your Railway project to your GitHub repository if you want to sync workflows.

## 2. Configure Environment Variables in Next.js

Update your `.env.local` or production environment variables on Vercel:

```bash
# Local Development (localhost n8n)
N8N_WEBHOOK_URL="http://localhost:5678/webhook-test/your-id"

# Production Environment (Cloud n8n)
N8N_PROD_WEBHOOK_URL="https://n8n-production.up.railway.app/webhook/your-prod-id"
```

The system is designed to automatically switch to `N8N_PROD_WEBHOOK_URL` when `NODE_ENV` is set to `production`.

## 3. Webhook Resiliency & Security

### Security
- In n8n, use **Header Authentication** for your webhooks.
- Add `X-N8N-API-KEY` to your Next.js `fetch` headers in `lib/orchestration.ts`.

### Retry Logic
The platform implements a fire-and-forget orchestration with asynchronous logging. If a webhook fails, it is recorded as a `CRITICAL` event in the `lead_events` table and a `Failed` status in `automation_events`.

### Monitoring
Monitor the **Automation Monitor** in the Command Center for:
- `duration_ms`: Identify slow workflows.
- `Health %`: Track success rates over time.

## 4. Scaling
For high-volume operations:
- Increase n8n concurrency.
- Use a dedicated Postgres instance for n8n.
- Implement n8n's queue mode with Redis.
