-- ============================================================
-- MIGRATION: PRODUCTION SECURITY & INTEL FIXES - PHASE 2
-- ============================================================

-- 1. Upgraded insert_lead_intake with safe phone duplicate logic
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
    v_normalized_phone TEXT;
BEGIN
    v_normalized_phone := NULLIF(BTRIM(p_phone), '');

    -- 1. Find or create lead group
    -- Safely checks email, and checks phone ONLY when p_phone is a valid non-empty, non-placeholder string.
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
    VALUES (
        v_lead_id, 
        'Intake', 
        p_description, 
        p_severity::event_severity, 
        jsonb_build_object('is_duplicate', v_is_duplicate, 'lead_group_id', v_group_id)
    );

    RETURN jsonb_build_object(
        'lead_id', v_lead_id,
        'is_duplicate', v_is_duplicate,
        'lead_group_id', v_group_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Create Profile Automated Trigger for new Supabase signups
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('ADMIN', 'MANAGER', 'AGENT');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    role user_role DEFAULT 'AGENT'::user_role NOT NULL,
    team_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can read profiles" ON public.profiles;
CREATE POLICY "Authenticated users can read profiles" ON public.profiles
FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admins can update profiles" ON public.profiles;
CREATE POLICY "Admins can update profiles" ON public.profiles
FOR UPDATE USING (
    EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role IN ('ADMIN', 'MANAGER')
    )
);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, role, team_id, created_at, updated_at)
    VALUES (
        new.id, 
        'AGENT'::user_role, 
        null, 
        now(), 
        now()
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

INSERT INTO public.profiles (id, role, team_id, created_at, updated_at)
SELECT id, 'AGENT'::user_role, null, now(), now()
FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- Safe trigger binding
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW 
  EXECUTE FUNCTION public.handle_new_user();
