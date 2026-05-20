# Lead Operations Intelligence Platform

A production-grade, high-density **Operational Command Center** built for SMB real estate teams. It optimizes lead response times, tracks critical SLA deadlines, implements resilient external API retries, and provides deep infrastructure observability.

---

## 🚀 Overview

The **Lead Operations Intelligence Platform** moves beyond traditional CRUD CRM database storage and into **active operational intelligence**. By employing an event-driven architecture, the platform enforces speed-to-lead contact rules, dynamically computes lead decay, manages response deadlines, and monitors the health of distributed integrations.

### Core Intelligence Vectors
* **Real-World Lead Decay Engine:** Automates lead categorization into urgency tiers based on elapsed time:
  * 🔥 **HOT (< 5 mins):** The golden window for conversion. Direct focus is enforced.
  * 🌡️ **WARM (< 60 mins):** High priority, requiring immediate attention.
  * 🧊 **COLD (< 24 hours):** Secondary response tier for same-day recovery.
  * ⚠️ **HIGH_RISK (≥ 24 hours):** Leads highly likely lost to competitors.
* **100-Point Urgency Scoring Engine:** Dynamically weights leads based on their status, decay level, and origin source, keeping critical contacts at the top of the operator’s queue.
* **Dynamic SLA Monitoring:** Features a global, color-coded **SLA Breach Banner** displaying orange warnings (< 1h overdue) or red alerts (≥ 1h overdue) when responses pass their deadlines.
* **Sliding Window Rate Limiter:** An active database-backed rate limiting layer restricts submissions to **5 submissions per 15 minutes** per IP address to safeguard system availability.
* **Integration & Callback Observability:** Direct tracking of n8n and Inngest workflows. The **System Health** center surfaces real-time heartbeat data, integration connection state, and the active exponential retry queue.

---

## 🏗️ System Architecture & Data Flow

The platform utilizes Next.js App Router server capabilities, background task processing, and PostgreSQL database triggers to orchestrate leads asynchronously:

```mermaid
flowchart TD
    %% Styling
    classDef client fill:#fafafa,stroke:#27272a,stroke-width:2px;
    classDef server fill:#f4f4f5,stroke:#71717a,stroke-width:2px;
    classDef database fill:#ecfdf5,stroke:#059669,stroke-width:2px;
    classDef orchestrator fill:#fff7ed,stroke:#ea580c,stroke-width:2px;

    %% Nodes
    Visitor((Web Visitor)):::client
    IntakeForm[Public Lead Intake<br/>/submit]:::client
    ActionIntake[Server Action: submitLead]:::server
    RateLimit{IP Rate Limit Check}:::server
    
    DB[(Supabase PostgreSQL)]:::database
    Timeline[(Lead Audit Timeline)]:::database
    
    CronSLA[SLA Cron Job<br/>/api/cron/sla]:::server
    Inngest[Inngest Background Cron]:::orchestrator
    n8n[n8n Automation Webhook]:::orchestrator
    Callback[HMAC Webhook Callback<br/>/api/orchestration/complete]:::server

    Dashboard[Command Center Dashboard<br/>/dashboard]:::client
    Health[System Health View<br/>/dashboard/system-health]:::client

    %% Flow
    Visitor -->|Submits Form| IntakeForm
    IntakeForm -->|Executes| ActionIntake
    ActionIntake -->|Verify| RateLimit
    RateLimit -->|Allowed? RPC| DB
    ActionIntake -->|Log Event| Timeline
    
    DB -.->|Real-Time Subscription| Dashboard
    Dashboard -->|View Diagnostics| Health

    %% Cron & Automation
    Inngest -->|SLA Checks & Retries| DB
    CronSLA -->|SLA Audit Loop| DB
    DB -->|Level 3+ Escalations| n8n
    n8n -->|HMAC-SHA256 Signed Result| Callback
    Callback -->|Update Status & Duration| DB
```

---

## 🖥️ Operational Dashboard Elements

### 1. The Priority Queue Grid (`/dashboard`)
* **Live SLA Countdown:** Shows seconds remaining until breach, or turns into a pulsing red `BREACHED` tag if response guidelines are missed.
* **Actionable Acknowledgement:** Agents can click **Acknowledge** on breached leads to silence follow-up escalations for 30 minutes, giving them an uninterrupted window to call the client.
* **Manual Control Switches:** Toggle between **Business Hours (9AM–5PM ET)** mode (deadlines pause on nights/weekends) and **24/7** mode dynamically.
* **Deduplication Banner:** Displays potential matches (same email or phone number). Allows operators to **Separate** (validate as unique) or **Archive** (remove duplicate noise).

### 2. Operational Intelligence Panel (Sidebar)
* **Revenue Risk Estimator:** Dynamically calculates potential lost revenue based on `HIGH_RISK` lead counts multiplied by customizable target deal values.
* **Ecosystem Monitors:** Visual indicator gauges for Supabase Connection, Inngest heartbeats, and n8n webhook health.
* **Live Audit Timeline:** Instantly retrieves the complete transactional log of the selected lead when clicked.

### 3. Systems Diagnostics Command (`/dashboard/system-health`)
* **Parallel Resilience:** All metrics and health statuses are loaded concurrently. If an individual API or database table is degraded, the rest of the dashboard remains operational.
* **Active Retry Logs:** Documents all failed webhooks waiting in the exponential backoff queue (30s ➔ 60s ➔ 120s ➔ 240s ➔ 480s).
* **Escalation Ledger:** A diagnostic timeline streaming the last 20 warning or critical-level system logs.

---

## 🔒 Security, Integrity & Reliability

* **HMAC-SHA256 Callback Verification:** Webhook callbacks received at `/api/orchestration/complete` require a timing-safe signature calculated from a shared `N8N_WEBHOOK_SECRET`, preventing cross-origin orchestration manipulation.
* **Cross-Lead Validation:** Callback payloads must match both the `orchestration_id` and the designated `lead_id` to block malicious state alterations.
* **Intelligent Rate Limiter:** Operates on an IP-based sliding window tracked inside the database, defending the lead ingest stream from brute-force spam.

---

## 🚦 Local Installation & Configuration

### Prerequisites
* **Node.js:** v18.x or newer
* **Supabase Account / CLI**
* **Inngest Dev Server**
* **n8n Instance** (for external automation webhook)

### 1. Project Setup
```bash
# Clone the repository
git clone <repository_url> lead-automation
cd lead-automation

# Install dependencies
npm install
```

### 2. Environment Variables
Create a `.env.local` file in the root directory:
```env
# Supabase Database Keys
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...

# n8n Orchestrations
N8N_WEBHOOK_URL=http://localhost:5678/webhook/intake
N8N_PROD_WEBHOOK_URL=https://n8n.yourdomain.com/webhook/intake

# n8n HMAC Callback Verification (Generate using: openssl rand -hex 32)
N8N_WEBHOOK_SECRET=your_hmac_secret_key

# Inngest Server Configuration
INNGEST_EVENT_KEY=your_inngest_event_key
INNGEST_SIGNING_KEY=your_inngest_signing_key

# Cron Protection Secret
CRON_SECRET=your_cron_verification_token
```

### 3. Running the Platform Locally
To start the operational environment, execute the Next.js development server and the Inngest background process:

```bash
# Run Next.js Dev Server
npm run dev

# Run Inngest Dev Server (in a separate terminal)
npx inngest-cli@latest dev
```

### 4. SLA Verification Hook
To manually trigger the SLA audit check and verify the escalation email or webhook pipelines:
```bash
curl -X GET "http://localhost:3000/api/cron/sla" \
  -H "Authorization: Bearer your_cron_verification_token"
```

---

## 📈 Architecture & Scale Considerations

1. **Transaction Isolation:** All lead intake routines execute via PostgreSQL RPCs to avoid split-brain states or concurrent race conditions during duplicate checks.
2. **Durable Webhook Queue:** Failed webhook triggers are offloaded to an asynchronous retry loop governed by exponential backoff policies, shielding the main dashboard thread from API timeouts.
3. **Optimized Indexes:** Ensure index coverage on `leads(email, phone, status)`, `automation_events(status, lead_id)`, and `rate_limits(ip_address, timestamp)` for sub-millisecond query performance at pilot scale.

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for details.
