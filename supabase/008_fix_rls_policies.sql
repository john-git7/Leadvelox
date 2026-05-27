-- ============================================================
-- MIGRATION 008: FIX RLS POLICIES
-- Replaces the over-permissive FOR ALL policy on leads with
-- explicit SELECT / INSERT / UPDATE policies.
-- Authenticated users can never DELETE via client — only
-- the service role (used by Server Actions) can.
-- ============================================================

-- 1. LEADS — remove blanket FOR ALL, add explicit granular policies
DROP POLICY IF EXISTS "Agents can manage leads" ON leads;

-- Any authenticated user can read leads (filtered further by app-level RBAC)
DROP POLICY IF EXISTS "Authenticated users can read leads" ON leads;
CREATE POLICY "Authenticated users can read leads" ON leads
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Any authenticated user can insert leads (public intake uses service role, but
-- logged-in agents may also create leads via the dashboard)
DROP POLICY IF EXISTS "Authenticated users can insert leads" ON leads;
CREATE POLICY "Authenticated users can insert leads" ON leads
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Any authenticated user can update leads (RBAC rules enforced at app layer)
DROP POLICY IF EXISTS "Authenticated users can update leads" ON leads;
CREATE POLICY "Authenticated users can update leads" ON leads
  FOR UPDATE USING (auth.uid() IS NOT NULL);

-- NO DELETE policy for authenticated users.
-- Deletes go through Server Actions that use createAdminClient() (service role),
-- which bypasses RLS by design. Direct client-level deletes are denied.


-- 2. LEAD_EVENTS — ensure INSERT is only via service role (admin client)
-- Currently only has SELECT. Service role bypasses RLS so writes are fine.
-- Explicitly add SELECT policy for authenticated reads.
DROP POLICY IF EXISTS "Authenticated users can read lead_events" ON lead_events;
CREATE POLICY "Authenticated users can read lead_events" ON lead_events
  FOR SELECT USING (auth.uid() IS NOT NULL);


-- 3. AUTOMATION_EVENTS — tighten to explicit SELECT + UPDATE
-- (service role handles INSERT; agents can read and update status via app layer)
DROP POLICY IF EXISTS "Agents can manage automation_events" ON automation_events;

DROP POLICY IF EXISTS "Authenticated users can read automation_events" ON automation_events;
CREATE POLICY "Authenticated users can read automation_events" ON automation_events
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can update automation_events" ON automation_events;
CREATE POLICY "Authenticated users can update automation_events" ON automation_events
  FOR UPDATE USING (auth.uid() IS NOT NULL);


-- 4. LEAD_GROUPS — tighten: remove public INSERT; service role only
DROP POLICY IF EXISTS "Enable public intake for groups" ON lead_groups;
-- Public lead intake uses createAdminClient() which bypasses RLS.
-- No unauthenticated/public INSERT should be allowed on this table directly.
