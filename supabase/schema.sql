-- 1. SAFE ENUM CREATION
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
END $$;

-- 2. LEAD GROUPS (Unified Identity)
CREATE TABLE IF NOT EXISTS lead_groups (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    primary_email TEXT NOT NULL,
    primary_phone TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 3. LEADS TABLE (Upgraded)
CREATE TABLE IF NOT EXISTS leads (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    lead_group_id UUID REFERENCES lead_groups(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    source TEXT NOT NULL,
    status lead_status DEFAULT 'New Lead'::lead_status NOT NULL,
    
    -- Intelligence Fields
    urgency_score INTEGER DEFAULT 100 NOT NULL,
    decay_status decay_status DEFAULT 'HOT'::decay_status NOT NULL,
    response_deadline TIMESTAMPTZ,
    last_contacted_at TIMESTAMPTZ,
    inactivity_duration INTERVAL,
    is_duplicate BOOLEAN DEFAULT FALSE,
    
    -- SLA & Escalation
    sla_status sla_status DEFAULT 'HEALTHY'::sla_status NOT NULL,
    sla_breached_at TIMESTAMPTZ,
    escalation_level INTEGER DEFAULT 0 NOT NULL,
    
    notes TEXT,
    assigned_agent_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 3. OPERATIONAL EVENT STREAM
CREATE TABLE IF NOT EXISTS lead_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE NOT NULL,
    event_type TEXT NOT NULL,
    description TEXT NOT NULL,
    severity event_severity DEFAULT 'INFO'::event_severity NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 5. AUTOMATION EVENTS (Health Monitoring & Retry Queue)
CREATE TABLE IF NOT EXISTS automation_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    workflow_name TEXT NOT NULL,
    status automation_status DEFAULT 'Pending' NOT NULL,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0 NOT NULL,
    duration_ms INTEGER,
    payload JSONB,
    endpoint_url TEXT,
    next_retry_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 5. UPDATED_AT TRIGGER
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS set_updated_at ON leads;
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON leads
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- 7. SECURITY (RLS)
ALTER TABLE lead_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_events ENABLE ROW LEVEL SECURITY;

-- 8. POLICIES
DROP POLICY IF EXISTS "Enable public intake for groups" ON lead_groups;
CREATE POLICY "Enable public intake for groups" ON lead_groups FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Agents can manage lead groups" ON lead_groups;
CREATE POLICY "Agents can manage lead groups" ON lead_groups FOR ALL USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Enable public intake" ON leads;
CREATE POLICY "Enable public intake" ON leads FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Agents can manage leads" ON leads;
CREATE POLICY "Agents can manage leads" ON leads FOR ALL USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Agents can view events" ON lead_events;
CREATE POLICY "Agents can view events" ON lead_events FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Agents can view health" ON automation_events;
CREATE POLICY "Agents can view health" ON automation_events FOR SELECT USING (auth.uid() IS NOT NULL);
