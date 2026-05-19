-- ============================================================
-- MIGRATION: PRODUCTION AUDIT FIXES - PHASE 1
-- ============================================================

-- 1. Create User Roles Type
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('ADMIN', 'MANAGER', 'AGENT');
    END IF;
END $$;

-- 2. Create Profiles Table for RBAC
CREATE TABLE IF NOT EXISTS profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    role user_role DEFAULT 'AGENT'::user_role NOT NULL,
    team_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can read profiles" ON profiles;
CREATE POLICY "Authenticated users can read profiles" ON profiles FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admins can update profiles" ON profiles;
CREATE POLICY "Admins can update profiles" ON profiles FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('ADMIN', 'MANAGER'))
);

-- Trigger for profiles updated_at
CREATE TRIGGER set_updated_at_profiles
BEFORE UPDATE ON profiles
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- 3. Lock down rate_limits table
-- Remove the permissive public policy. Service role bypasses RLS anyway.
-- Without a policy, all operations by anon/authenticated users are denied.
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role can manage rate limits" ON rate_limits;
