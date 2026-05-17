-- ============================================================
-- MIGRATION: PRODUCTION AUDIT FIXES
-- Run this after migration_operational.sql and migration_settings.sql
-- ============================================================

-- 1. Rate Limits Table (replaces broken email-based check)
CREATE TABLE IF NOT EXISTS rate_limits (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    identifier TEXT NOT NULL, -- Stores hashed IP or email
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_identifier ON rate_limits(identifier);
CREATE INDEX IF NOT EXISTS idx_rate_limits_created_at ON rate_limits(created_at);

-- RLS for rate_limits (public inserts for intake, no reads needed from client)
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role can manage rate limits" ON rate_limits;
CREATE POLICY "Service role can manage rate limits" ON rate_limits FOR ALL USING (true);

-- 2. Add last_acknowledged_at to leads (for alert suppression in cron)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_acknowledged_at TIMESTAMPTZ;

-- 3. Extend system_settings with configurable operational parameters
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS sla_response_minutes INT NOT NULL DEFAULT 5;
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS avg_deal_value INT NOT NULL DEFAULT 1200;
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS ack_suppression_minutes INT NOT NULL DEFAULT 30;
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS escalation_thresholds JSONB NOT NULL DEFAULT '[
  {"level": 1, "delayMinutes": 0, "description": "SLA Warning Triggered"},
  {"level": 2, "delayMinutes": 5, "description": "Dashboard Priority Escalation"},
  {"level": 3, "delayMinutes": 15, "description": "Escalation Webhook Fired"},
  {"level": 4, "delayMinutes": 60, "description": "Critical Operational Alert Fired"}
]'::jsonb;

-- Backfill defaults for existing row
UPDATE system_settings SET
    sla_response_minutes = COALESCE(sla_response_minutes, 5),
    avg_deal_value = COALESCE(avg_deal_value, 1200),
    ack_suppression_minutes = COALESCE(ack_suppression_minutes, 30)
WHERE id = 1;

-- 4. Performance Indices (were missing — cause full table scans in cron)
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_sla_status ON leads(sla_status);
CREATE INDEX IF NOT EXISTS idx_leads_decay_status ON leads(decay_status);
CREATE INDEX IF NOT EXISTS idx_leads_urgency_score ON leads(urgency_score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lead_events_lead_id ON lead_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_events_severity ON lead_events(severity);
CREATE INDEX IF NOT EXISTS idx_lead_events_created_at ON lead_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_automation_events_status ON automation_events(status);
CREATE INDEX IF NOT EXISTS idx_automation_events_next_retry ON automation_events(next_retry_at)
    WHERE status = 'Retrying';
CREATE INDEX IF NOT EXISTS idx_automation_events_created_at ON automation_events(created_at DESC);
