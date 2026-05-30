# LeadVelox — Lead Operations Intelligence Platform

> A production-ready, enterprise-grade lead management system built for real estate and high-ticket sales teams. It prevents revenue loss by monitoring every lead in real-time, firing automated escalation alerts, and giving managers a complete audit trail of every action taken.

---

## What Does This Application Do?

Most sales teams lose hot leads simply because nobody responded fast enough. LeadVelox solves this by acting as a **real-time operational radar** for your lead pipeline:

1. A new lead comes in (from a website form, Facebook ad, etc.).
2. The system **automatically scores** the lead's urgency and sets a response deadline.
3. If nobody contacts the lead in time, the system **fires escalating alerts** — first to the agent, then to the manager, then a critical webhook.
4. Every action (who contacted who, when, what happened) is **permanently logged** into an audit trail.
5. Managers see a **live command center** dashboard showing all leads, their urgency scores, SLA breach status, and automation health.

---

## Project Structure

```
leadvelox/
├── app/                    → All the web pages and API endpoints
│   ├── page.tsx            → The public marketing homepage (/)
│   ├── login/              → The login screen (/login)
│   ├── submit/             → The public lead intake form (/submit)
│   ├── dashboard/          → The main operational dashboard (/dashboard)
│   │   └── settings/       → System settings page (/dashboard/settings)
│   ├── actions/            → Server-side business logic (leads.ts)
│   └── api/                → Backend API routes
│       ├── cron/sla/       → The automated SLA checker that runs every minute
│       ├── report/         → Report generation endpoint
│       └── inngest/        → Background job processor
├── components/             → All UI building blocks
│   ├── CommandCenter.tsx   → The main dashboard brain
│   ├── LeadDashboard.tsx   → The lead table with sorting and filters
│   ├── LeadDetailModal.tsx → The popup when you click on a lead
│   ├── AutomationHealth.tsx→ The automation event monitor panel
│   ├── DuplicateReview.tsx → The duplicate lead detection banner
│   ├── SLABreachBanner.tsx → The red alert banner for missed deadlines
│   ├── RevenueRisk.tsx     → The "money at risk" calculator widget
│   └── IntegrationIndicators.tsx → Status indicators for external tools
├── lib/                    → Core logic libraries
│   ├── orchestration.ts    → Urgency score & decay status calculator
│   ├── sla.ts              → SLA deadline calculator
│   ├── rate-limit.ts       → Anti-spam protection
│   └── supabase/           → Database connection helpers
├── supabase/               → Database setup files
│   ├── 000_complete_schema.sql → Full database structure (run this first)
│   ├── demo_seed.sql       → Sample data for client demos
│   └── *.sql               → Migration files for incremental updates
├── inngest/                → Background job definitions
├── n8n/                    → n8n workflow export files
└── __tests__/              → Automated test files
```

---

## Core Concepts Explained

### What is a "Lead"?
A lead is a potential customer who has expressed interest in your business (e.g., they filled out a form on your website or clicked a Facebook ad). In this system, every lead has a name, email, phone number, urgency score, and SLA deadline attached to it.

### What is "Lead Decay"?
The longer a lead sits without being contacted, the less likely they are to convert into a paying customer. Research shows that if you don't call a hot lead within 5 minutes, your chances of closing them drop by over 80%. This system tracks how "fresh" or "decayed" each lead is:

| Status | Time Since Lead Arrived | What It Means |
|---|---|---|
| 🔥 **HOT** | Under 5 minutes | Golden window. Contact immediately. |
| 🌡️ **WARM** | Under 60 minutes | Urgent. Act within the hour. |
| 🧊 **COLD** | Under 24 hours | Degraded. Same-day recovery possible. |
| ⚠️ **HIGH_RISK** | Over 24 hours | Critical. Lead likely went to a competitor. |

### What is an "Urgency Score"?
A number from 0–100 automatically calculated by the system to rank leads in the queue. The highest urgency score appears at the top of the dashboard so agents always work on the most critical lead first.

| Decay Status | Urgency Score | Why |
|---|---|---|
| HIGH_RISK | **100** | Maximum score — revenue is actively at risk. |
| HOT | **95** | Near-maximum — the golden 5-minute window is open. |
| WARM | **75** | High priority but still within recovery range. |
| COLD | **40** | Degraded but salvageable today. |

### What is an "SLA"?
**SLA** stands for **Service Level Agreement**. It is a deadline — a promise that your team will contact a lead within a specific time window (e.g., 5 minutes). This system enforces SLA deadlines automatically. If the deadline is missed, an escalation alarm fires. The system also supports **Business Hours Mode**, where deadlines pause on nights and weekends.

### What is "Escalation"?
When an SLA deadline is missed, the system doesn't just sit quietly. It escalates the urgency through 5 levels:

| Level | What Happens |
|---|---|
| L0 | Lead is created and enters the queue. |
| L1 | Warning fires. Lead is highlighted in the dashboard. |
| L2 | High priority alert. Lead is surfaced to the top of the queue. |
| L3 | Manager notification fired (Slack webhook). |
| L4 | Critical webhook fired. Maximum urgency. |

### What is "Acknowledge"?
When a manager or agent clicks **Acknowledge** on a breached lead, it tells the system: *"I am actively working on this right now. Stop firing alarms for the next 30 minutes while I handle it."* An acknowledge event is permanently logged in the audit timeline.

### What is the "Audit Timeline"?
Every single action on a lead (it was created, an email was sent, a status was changed, an alarm fired) is permanently written to the `lead_events` table. This creates an immutable, tamper-proof history of the entire lead lifecycle. Managers can open any lead and see exactly what happened, when, and who did it.

### What is "Duplicate Detection"?
If two leads share the same email address or phone number, the system automatically flags the second one as a duplicate and surfaces a **Duplicate Review** banner on the dashboard. Managers can either confirm it as a unique lead (Separate) or archive the duplicate.

---

## Technology Stack

| Technology | What It Is (Plain English) |
|---|---|
| **Next.js 15** | The web framework. It handles all the web pages, API routes, and server logic in one place. |
| **React** | The JavaScript library used to build all the interactive UI components (buttons, modals, tables). |
| **TypeScript** | A stricter version of JavaScript that catches bugs before the code even runs. |
| **Supabase** | Your database in the cloud. Built on PostgreSQL (the gold standard for relational databases). It also handles user logins and real-time data syncing to the dashboard. |
| **PostgreSQL** | The actual database engine running inside Supabase. Think of it as an extremely powerful, structured spreadsheet where all your leads and events live. |
| **Row Level Security (RLS)** | A database-level security feature. Even if someone had access to the database, they still cannot see data they are not authorized to see. The rules are enforced by the database itself, not just the website. |
| **n8n** | An automation tool (similar to Zapier). It handles all the external notifications — sending emails, firing Slack messages, hitting webhooks when a lead escalates. |
| **Inngest** | A background job processor. It handles tasks that should not run in the main web request, like checking SLA deadlines every minute without slowing down the dashboard. |
| **Vercel** | The cloud hosting platform where the Next.js application is deployed and served to users worldwide. |
| **TailwindCSS** | The styling framework used to design all the UI components and layouts. |

---

## Security Features

### 1. Role-Based Access Control (RBAC)
Three user roles with different levels of access:

| Role | What They Can See & Do |
|---|---|
| **ADMIN** | Full God-View of all leads. Can manage system settings, bulk delete, and assign any lead. |
| **MANAGER** | Full God-View of all leads. Can reassign leads and manage SLA settings. Cannot access system configuration. |
| **AGENT** | Can only see leads assigned to them and unclaimed leads. Cannot see other agents' pipelines. |

This is enforced at the **server level** in `app/actions/leads.ts`. Even if an agent tried to access manager-only data directly, the server physically refuses to return it.

### 2. Row Level Security (RLS)
Every table in the database has RLS enabled. This is a second layer of security below the application level. Even if a bug in the code accidentally tried to return another agent's leads, the database itself would block it.

### 3. Rate Limiting
To prevent spam bots from flooding your lead intake form with fake leads, the system tracks how many submissions come from each IP address. It allows a maximum of **5 submissions per 15 minutes** per IP. If the limit is exceeded, the system blocks further submissions automatically.

### 4. Server-Side Only Execution
All database operations, API keys, and sensitive business logic run exclusively on the **server**, never in the browser. This means your Supabase API keys and n8n webhook URLs are never exposed to end users.

---

## Getting Started

### Prerequisites
Before you begin, make sure you have the following installed on your computer:
- **Node.js v18+** — The JavaScript runtime. Download from [nodejs.org](https://nodejs.org).
- **A Supabase Account** — Sign up free at [supabase.com](https://supabase.com).
- **An n8n Instance** — Either self-hosted on a DigitalOcean server or via [n8n Cloud](https://n8n.io).

### Step 1: Install the Project
```bash
# Clone this repository to your computer
git clone <repository_url> leadvelox
cd leadvelox

# Install all the required packages
npm install
```

### Step 2: Set Up Environment Variables
Create a file called `.env.local` in the root folder of the project. Copy the contents from `.env.local.example` and fill in your own credentials:

```env
# --- SUPABASE (Your Database) ---
# Found in: Supabase Project → Settings → API
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...        # The "anon public" key
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...             # The "service_role" key (keep this SECRET)

# --- N8N (Your Automation Engine) ---
N8N_WEBHOOK_URL=http://localhost:5678/webhook/intake   # For local testing
N8N_PROD_WEBHOOK_URL=https://your-n8n.com/webhook/intake  # Your live n8n URL

# --- CRON PROTECTION ---
# A secret password that prevents unauthorized people from triggering the SLA checker
CRON_SECRET=make_up_a_long_random_string_here
```

### Step 3: Set Up the Database
1. Log into [supabase.com](https://supabase.com) and open your project.
2. Click **SQL Editor** in the left menu.
3. Copy the entire contents of `supabase/000_complete_schema.sql` and paste it into the editor.
4. Click **Run**. This creates all the tables, security rules, and database functions.

### Step 4: Load the Demo Data (For Testing)
```sql
-- Paste this file into Supabase SQL Editor to load 7 sample leads for demos
-- File: supabase/demo_seed.sql
```

### Step 5: Run the Application
```bash
# Start the web application (open http://localhost:3000)
npm run dev
```

### Step 6: Manually Trigger the SLA Checker (Optional)
The SLA checker runs automatically via a cron job in production. To test it locally:
```bash
curl -X GET "http://localhost:3000/api/cron/sla" \
  -H "Authorization: Bearer your_cron_secret_here"
```

---

## Dashboard Pages

| URL | Page | Who Can Access |
|---|---|---|
| `/` | Public marketing homepage | Everyone |
| `/submit` | Public lead intake form | Everyone |
| `/login` | Login screen | Everyone |
| `/dashboard` | Main Operational Command Center | Admin, Manager, Agent |
| `/dashboard/settings` | System settings (SLA config) | Admin, Manager |

---

## How a Lead Flows Through the System

```
1. Lead submits form at /submit
        ↓
2. Server validates the data (checks for spam/invalid email)
        ↓
3. Rate limit check (max 5 per 15 mins from same IP)
        ↓
4. Urgency score calculated (HOT=95, WARM=75, COLD=40, HIGH_RISK=100)
        ↓
5. SLA deadline set (e.g., "must be contacted within 5 minutes")
        ↓
6. Lead saved to Supabase database
        ↓
7. Intake event logged to audit timeline
        ↓
8. n8n webhook fires (sends welcome email to lead)
        ↓
9. Dashboard updates in real-time via Supabase real-time subscription
        ↓
10. If deadline passes → Cron job fires escalation alerts (L1 → L2 → L3 → L4)
        ↓
11. Agent contacts lead → Status updated → Audit event logged
        ↓
12. Lead resolved (Contacted / Qualified / Closed / Lost)
```

---

## Database Tables

| Table | What It Stores |
|---|---|
| `leads` | Every lead — name, email, phone, status, urgency score, SLA status. |
| `lead_events` | The complete audit timeline for every lead (every status change, escalation, acknowledgement). |
| `lead_groups` | Groups duplicate leads together for the duplicate detection feature. |
| `automation_events` | Logs every n8n workflow execution (success or failure). |
| `profiles` | User accounts with their assigned roles (ADMIN/MANAGER/AGENT). |
| `system_settings` | Global settings like Business Hours mode and SLA response time window. |
| `rate_limits` | Tracks IP addresses for the anti-spam rate limiter. |

---

## Pricing Model (For Agency Use)

| Item | Amount |
|---|---|
| Setup Fee (Upfront) | $500 |
| Setup Fee (On Completion) | $500 |
| Monthly Retainer (All-Inclusive) | $200–$300 / month |
| Custom Feature (e.g. Separate Dashboards) | $500–$1,500 one-time |
| Server Cost (Supabase Pro + Vercel Pro + n8n) | ~$65 / month |
| **Net Monthly Profit (per client)** | **$135–$235 / month** |

---

## License

Distributed under the MIT License. See `LICENSE` for details.
