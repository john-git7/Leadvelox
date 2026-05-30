-- ============================================================
-- LEADVELOX — COMPLETE SCHEMA v1.0
-- Single idempotent migration file.
-- Run this once on a fresh Supabase project to bring the DB to
-- full production state. Every statement uses IF NOT EXISTS /
-- CREATE OR REPLACE / ON CONFLICT DO NOTHING so it is safe to
-- re-run on an existing database.
--
-- Execution order (dependency-driven):
--   1. Types (ENUMs)
--   2. Core tables (leaf → root: settings, rate_limits, lead_groups, leads)
--   3. Child tables (lead_events, automation_events, cron_heartbeat, profiles)
--   4. Triggers & functions
--   5. Indexes
--   6. RLS & policies
--   7. Seed data
-- ============================================================

-- ============================================================
-- 1. ENUM TYPES
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lead_status') THEN
    CREATE TYPE lead_status AS ENUM ('New Lead', 'Contacted', 'Qualified', 'Lost', 'Closed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'decay_status') THEN
    CREATE TYPE decay_status AS ENUM ('HOT', 'WARM', 'COLD', 'HIGH_RISK');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'automation_status') THEN
    CREATE TYPE automation_status AS ENUM ('Success', 'Failed', 'Retrying', 'Pending');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sla_status') THEN
    CREATE TYPE sla_status AS ENUM ('HEALTHY', 'WARNING', 'BREACHED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_severity') THEN
    CREATE TYPE event_severity AS ENUM ('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('ADMIN', 'MANAGER', 'AGENT');
  END IF;
END $$;


-- ============================================================
-- 2. CORE TABLES
-- ============================================================

-- System-wide operational configuration (singleton row, id = 1)
CREATE TABLE IF NOT EXISTS system_settings (
  id                      INT PRIMARY KEY DEFAULT 1,
  enforce_business_hours  BOOLEAN NOT NULL DEFAULT true,
  agency_name             TEXT NOT NULL DEFAULT '',
  notification_target     TEXT NOT NULL DEFAULT '',
  sla_response_minutes    INT  NOT NULL DEFAULT 5,
  avg_deal_value          INT  NOT NULL DEFAULT 1200,
  ack_suppression_minutes INT  NOT NULL DEFAULT 30,
  escalation_thresholds   JSONB NOT NULL DEFAULT '[
    {"level": 1, "delayMinutes": 0,  "description": "SLA Warning Triggered"},
    {"level": 2, "delayMinutes": 5,  "description": "Dashboard Priority Escalation"},
    {"level": 3, "delayMinutes": 15, "description": "Escalation Webhook Fired"},
    {"level": 4, "delayMinutes": 60, "description": "Critical Operational Alert Fired"}
  ]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sliding-window rate limiter (one row per accepted request)
CREATE TABLE IF NOT EXISTS rate_limits (
  id         UUID      NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  identifier TEXT      NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lead identity deduplication groups (one group per unique person)
CREATE TABLE IF NOT EXISTS lead_groups (
  id            UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  primary_email TEXT NOT NULL,
  primary_phone TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Core leads table
CREATE TABLE IF NOT EXISTS leads (
  id                   UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_group_id        UUID        REFERENCES lead_groups(id) ON DELETE SET NULL,
  name                 TEXT        NOT NULL,
  email                TEXT        NOT NULL,
  phone                TEXT        NOT NULL,
  source               TEXT        NOT NULL,
  status               lead_status NOT NULL DEFAULT 'New Lead'::lead_status,
  -- Intelligence
  urgency_score        INTEGER     NOT NULL DEFAULT 100,
  decay_status         decay_status NOT NULL DEFAULT 'HOT'::decay_status,
  response_deadline    TIMESTAMPTZ,
  last_contacted_at    TIMESTAMPTZ,
  inactivity_duration  INTERVAL,
  is_duplicate         BOOLEAN     NOT NULL DEFAULT FALSE,
  delete_requested     BOOLEAN     NOT NULL DEFAULT FALSE,
  -- SLA & Escalation
  sla_status           sla_status  NOT NULL DEFAULT 'HEALTHY'::sla_status,
  sla_breached_at      TIMESTAMPTZ,
  escalation_level     INTEGER     NOT NULL DEFAULT 0,
  last_acknowledged_at TIMESTAMPTZ,
  -- Misc
  notes                TEXT,
  assigned_agent_id    UUID        REFERENCES auth.users(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Operational audit / event stream per lead
CREATE TABLE IF NOT EXISTS lead_events (
  id         UUID          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id    UUID          NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  event_type TEXT          NOT NULL,
  description TEXT         NOT NULL,
  severity   event_severity NOT NULL DEFAULT 'INFO'::event_severity,
  metadata   JSONB,
  created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Webhook orchestration events (retry queue + health monitoring)
CREATE TABLE IF NOT EXISTS automation_events (
  id            UUID             NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id       UUID             REFERENCES leads(id) ON DELETE CASCADE,
  workflow_name TEXT             NOT NULL,
  status        automation_status NOT NULL DEFAULT 'Pending',
  error_message TEXT,
  retry_count   INTEGER          NOT NULL DEFAULT 0,
  duration_ms   INTEGER,
  payload       JSONB,
  endpoint_url  TEXT,
  next_retry_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

-- Cron health heartbeat (singleton row, id = 1)
CREATE TABLE IF NOT EXISTS cron_heartbeat (
  id             INTEGER     PRIMARY KEY,
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RBAC user profiles (1-to-1 with auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id         UUID      NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  role       user_role NOT NULL DEFAULT 'AGENT'::user_role,
  team_id    UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- 3. TRIGGER FUNCTIONS
-- ============================================================

-- Generic updated_at maintenance trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Auto-create AGENT profile row when a user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, role, created_at, updated_at)
  VALUES (NEW.id, 'AGENT'::user_role, NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atomic rate-limit check with advisory transaction lock.
-- Returns TRUE = request allowed, FALSE = rate limit exceeded.
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_identifier TEXT,
  p_limit       INTEGER DEFAULT 5,
  p_window_min  INTEGER DEFAULT 15
) RETURNS BOOLEAN AS $$
DECLARE
  v_window_start TIMESTAMPTZ := NOW() - (p_window_min || ' minutes')::INTERVAL;
  v_count        INTEGER;
  v_lock_key     BIGINT;
BEGIN
  -- Serialise concurrent calls for the same identifier.
  v_lock_key := abs(hashtext(p_identifier)::BIGINT);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  DELETE FROM rate_limits
  WHERE identifier = p_identifier AND created_at < v_window_start;

  SELECT COUNT(*) INTO v_count
  FROM rate_limits
  WHERE identifier = p_identifier AND created_at >= v_window_start;

  IF v_count >= p_limit THEN
    RETURN FALSE;
  END IF;

  INSERT INTO rate_limits (identifier) VALUES (p_identifier);
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Transactional lead intake with safe duplicate detection.
-- Returns jsonb: { lead_id, is_duplicate, lead_group_id }
CREATE OR REPLACE FUNCTION insert_lead_intake(
  p_name             TEXT,
  p_email            TEXT,
  p_phone            TEXT,
  p_source           TEXT,
  p_decay_status     TEXT,
  p_urgency_score    INTEGER,
  p_response_deadline TIMESTAMPTZ,
  p_severity         TEXT,
  p_description      TEXT
) RETURNS JSONB AS $$
DECLARE
  v_group_id        UUID;
  v_lead_id         UUID;
  v_is_duplicate    BOOLEAN;
  v_normalized_phone TEXT;
BEGIN
  v_normalized_phone := NULLIF(BTRIM(p_phone), '');

  -- Find existing group by email or normalised phone (skip N/A placeholders)
  SELECT id INTO v_group_id FROM lead_groups
  WHERE primary_email = p_email
     OR (
       v_normalized_phone IS NOT NULL
       AND UPPER(v_normalized_phone) <> 'N/A'
       AND LOWER(v_normalized_phone) <> 'null'
       AND primary_phone = v_normalized_phone
     )
  LIMIT 1;

  IF v_group_id IS NOT NULL THEN
    v_is_duplicate := TRUE;
  ELSE
    v_is_duplicate := FALSE;
    INSERT INTO lead_groups (primary_email, primary_phone)
    VALUES (p_email, v_normalized_phone)
    RETURNING id INTO v_group_id;
  END IF;

  INSERT INTO leads (
    lead_group_id, name, email, phone, source, status,
    is_duplicate, decay_status, urgency_score, response_deadline, sla_status
  ) VALUES (
    v_group_id, p_name, p_email, p_phone, p_source, 'New Lead'::lead_status,
    v_is_duplicate, p_decay_status::decay_status, p_urgency_score,
    p_response_deadline, 'HEALTHY'::sla_status
  ) RETURNING id INTO v_lead_id;

  INSERT INTO lead_events (lead_id, event_type, description, severity, metadata)
  VALUES (
    v_lead_id, 'Intake', p_description, p_severity::event_severity,
    jsonb_build_object('is_duplicate', v_is_duplicate, 'lead_group_id', v_group_id)
  );

  RETURN jsonb_build_object(
    'lead_id',       v_lead_id,
    'is_duplicate',  v_is_duplicate,
    'lead_group_id', v_group_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- 4. TRIGGERS
-- ============================================================

DROP TRIGGER IF EXISTS set_updated_at ON leads;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_profiles ON profiles;
CREATE TRIGGER set_updated_at_profiles
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ============================================================
-- 5. INDEXES
-- ============================================================

-- leads — covering index for SLA cron (status filter + created_at ORDER BY)
CREATE INDEX IF NOT EXISTS idx_leads_status_created     ON leads (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_status             ON leads (status);
CREATE INDEX IF NOT EXISTS idx_leads_sla_status         ON leads (sla_status);
CREATE INDEX IF NOT EXISTS idx_leads_decay_status       ON leads (decay_status);
CREATE INDEX IF NOT EXISTS idx_leads_urgency_score      ON leads (urgency_score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_created_at         ON leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_lead_group_id      ON leads (lead_group_id);

-- lead_events
CREATE INDEX IF NOT EXISTS idx_lead_events_lead_id      ON lead_events (lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_events_severity     ON lead_events (severity);
CREATE INDEX IF NOT EXISTS idx_lead_events_created_at   ON lead_events (created_at DESC);

-- automation_events
CREATE INDEX IF NOT EXISTS idx_automation_events_status      ON automation_events (status);
CREATE INDEX IF NOT EXISTS idx_automation_events_next_retry  ON automation_events (next_retry_at) WHERE status = 'Retrying';
CREATE INDEX IF NOT EXISTS idx_automation_events_created_at  ON automation_events (created_at DESC);

-- rate_limits (advisory-lock path still benefits from identifier index for pruning)
CREATE INDEX IF NOT EXISTS idx_rate_limits_identifier   ON rate_limits (identifier);
CREATE INDEX IF NOT EXISTS idx_rate_limits_created_at   ON rate_limits (created_at);


-- ============================================================
-- 6. ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE system_settings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits        ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_groups        ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads              ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE cron_heartbeat     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles    ENABLE ROW LEVEL SECURITY;

-- system_settings: ADMIN/MANAGER write, all authenticated users read
DROP POLICY IF EXISTS "Authenticated users can read settings" ON system_settings;
CREATE POLICY "Authenticated users can read settings" ON system_settings
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- rate_limits: service role only (no client policy needed — RLS blocks all non-service-role)

-- lead_groups: service role for writes (public intake uses admin client); authenticated reads
DROP POLICY IF EXISTS "Authenticated users can read lead groups" ON lead_groups;
CREATE POLICY "Authenticated users can read lead groups" ON lead_groups
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- leads: explicit per-operation policies; no DELETE policy → deletes require service role
DROP POLICY IF EXISTS "Enable public intake" ON leads;
DROP POLICY IF EXISTS "Agents can manage leads" ON leads;
DROP POLICY IF EXISTS "Authenticated users can read leads" ON leads;
DROP POLICY IF EXISTS "Authenticated users can insert leads" ON leads;
DROP POLICY IF EXISTS "Authenticated users can update leads" ON leads;

CREATE POLICY "Authenticated users can read leads" ON leads
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert leads" ON leads
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update leads" ON leads
  FOR UPDATE USING (auth.uid() IS NOT NULL);

-- lead_events: read-only for authenticated; writes via service role
DROP POLICY IF EXISTS "Agents can view events" ON lead_events;
DROP POLICY IF EXISTS "Authenticated users can read lead_events" ON lead_events;
CREATE POLICY "Authenticated users can read lead_events" ON lead_events
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- automation_events: read + update for authenticated; inserts via service role
DROP POLICY IF EXISTS "Agents can view health" ON automation_events;
DROP POLICY IF EXISTS "Authenticated users can read automation_events" ON automation_events;
DROP POLICY IF EXISTS "Authenticated users can update automation_events" ON automation_events;
CREATE POLICY "Authenticated users can read automation_events" ON automation_events
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update automation_events" ON automation_events
  FOR UPDATE USING (auth.uid() IS NOT NULL);

-- cron_heartbeat: all authenticated users can read; writes via service role
DROP POLICY IF EXISTS "Authenticated users can read heartbeat" ON cron_heartbeat;
CREATE POLICY "Authenticated users can read heartbeat" ON cron_heartbeat
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- profiles: all authenticated can read; only ADMIN/MANAGER can update
-- MANAGER cannot self-promote to ADMIN (WITH CHECK enforces this)
DROP POLICY IF EXISTS "Authenticated users can read profiles" ON public.profiles;
CREATE POLICY "Authenticated users can read profiles" ON public.profiles
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admins can update profiles" ON public.profiles;
CREATE POLICY "Admins can update profiles" ON public.profiles
  FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('ADMIN', 'MANAGER'))
  )
  WITH CHECK (
    -- Only ADMIN may promote to ADMIN
    (role = 'ADMIN' AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'ADMIN'))
    OR
    -- ADMIN or MANAGER may set any non-ADMIN role
    (role != 'ADMIN' AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('ADMIN', 'MANAGER')))
  );


-- ============================================================
-- 7. SEED DATA
-- ============================================================

-- Singleton settings row
INSERT INTO system_settings (id, enforce_business_hours)
VALUES (1, true)
ON CONFLICT (id) DO NOTHING;

-- Singleton heartbeat row
INSERT INTO cron_heartbeat (id, last_heartbeat)
VALUES (1, NOW())
ON CONFLICT (id) DO NOTHING;

-- Backfill profiles for any auth users who signed up before the trigger existed
INSERT INTO public.profiles (id, role, created_at, updated_at)
SELECT id, 'AGENT'::user_role, NOW(), NOW()
FROM auth.users
ON CONFLICT (id) DO NOTHING;
