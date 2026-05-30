-- ============================================================
-- MIGRATION 009: FIX PROFILES RLS
-- Prevent MANAGER from self-promoting to ADMIN.
-- ============================================================

DROP POLICY IF EXISTS "Admins can update profiles" ON public.profiles;

CREATE POLICY "Admins can update profiles" ON public.profiles
FOR UPDATE USING (
    -- The user must be an ADMIN or MANAGER to update profiles
    EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role IN ('ADMIN', 'MANAGER')
    )
) WITH CHECK (
    -- If the role is being changed to ADMIN, the executing user must ALREADY be an ADMIN.
    (
        role = 'ADMIN' AND EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.role = 'ADMIN'
        )
    )
    OR
    -- Otherwise, ADMIN or MANAGER is allowed to make the update
    (
        role != 'ADMIN' AND EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.role IN ('ADMIN', 'MANAGER')
        )
    )
);
