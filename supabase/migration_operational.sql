-- 1. Create Lead Groups (Main Lead Identity)
CREATE TABLE IF NOT EXISTS lead_groups (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    primary_email TEXT NOT NULL,
    primary_phone TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 2. Update Leads Table
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_group_id UUID REFERENCES lead_groups(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_leads_lead_group_id ON leads(lead_group_id);

-- 3. Enhance Automation Events for Webhook Retry Queue
ALTER TABLE automation_events ADD COLUMN IF NOT EXISTS payload JSONB;
ALTER TABLE automation_events ADD COLUMN IF NOT EXISTS endpoint_url TEXT;
ALTER TABLE automation_events ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ;

-- 4. RLS for lead_groups
ALTER TABLE lead_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agents can manage lead groups" ON lead_groups;
CREATE POLICY "Agents can manage lead groups" ON lead_groups FOR ALL USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Enable public intake for groups" ON lead_groups;
CREATE POLICY "Enable public intake for groups" ON lead_groups FOR INSERT WITH CHECK (true);

-- 5. Cron Health Monitoring
CREATE TABLE IF NOT EXISTS cron_heartbeat (
    id INTEGER PRIMARY KEY,
    last_heartbeat TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Insert initial heartbeat row if empty
INSERT INTO cron_heartbeat (id, last_heartbeat) VALUES (1, NOW()) ON CONFLICT DO NOTHING;

-- 6. Transaction Safety (RPC for Lead Intake)
CREATE OR REPLACE FUNCTION insert_lead_intake(
    p_name TEXT,
    p_email TEXT,
    p_phone TEXT,
    p_source TEXT,
    p_decay_status text,
    p_urgency_score INTEGER,
    p_response_deadline TIMESTAMPTZ,
    p_severity text,
    p_description TEXT
) RETURNS jsonb AS $$
DECLARE
    v_group_id UUID;
    v_lead_id UUID;
    v_is_duplicate BOOLEAN;
BEGIN
    -- 1. Find or create lead group
    SELECT id INTO v_group_id FROM lead_groups 
    WHERE primary_email = p_email OR primary_phone = p_phone LIMIT 1;
    
    IF v_group_id IS NOT NULL THEN
        v_is_duplicate := TRUE;
    ELSE
        v_is_duplicate := FALSE;
        INSERT INTO lead_groups (primary_email, primary_phone) 
        VALUES (p_email, p_phone) 
        RETURNING id INTO v_group_id;
    END IF;

    -- 2. Insert Lead
    INSERT INTO leads (
        lead_group_id, name, email, phone, source, status, 
        is_duplicate, decay_status, urgency_score, response_deadline, sla_status
    ) VALUES (
        v_group_id, p_name, p_email, p_phone, p_source, 'New Lead'::lead_status,
        v_is_duplicate, p_decay_status::decay_status, p_urgency_score, p_response_deadline, 'HEALTHY'::sla_status
    ) RETURNING id INTO v_lead_id;

    -- 3. Insert Lead Event
    INSERT INTO lead_events (lead_id, event_type, description, severity, metadata)
    VALUES (v_lead_id, 'Intake', p_description, p_severity::event_severity, jsonb_build_object('is_duplicate', v_is_duplicate, 'lead_group_id', v_group_id));

    RETURN jsonb_build_object(
        'lead_id', v_lead_id,
        'is_duplicate', v_is_duplicate,
        'lead_group_id', v_group_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
