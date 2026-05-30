-- ============================================================
-- MIGRATION 010: ATOMIC RATE LIMITER
-- Replaces the application-level COUNT → INSERT pattern
-- with a single atomic PostgreSQL function that uses an
-- advisory transaction lock to prevent race conditions.
-- ============================================================

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
  -- Derive a deterministic 64-bit lock key from the identifier string.
  -- pg_advisory_xact_lock serialises all concurrent calls for the SAME
  -- identifier; different identifiers get different locks and run in parallel.
  v_lock_key := abs(hashtext(p_identifier)::BIGINT);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Prune expired records for this identifier inside the lock.
  DELETE FROM rate_limits
  WHERE identifier = p_identifier
    AND created_at < v_window_start;

  -- Count how many requests remain in the sliding window.
  SELECT COUNT(*) INTO v_count
  FROM rate_limits
  WHERE identifier = p_identifier
    AND created_at >= v_window_start;

  -- If at or over limit, deny without inserting.
  IF v_count >= p_limit THEN
    RETURN FALSE;
  END IF;

  -- Record this request.
  INSERT INTO rate_limits (identifier) VALUES (p_identifier);
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Add the covering index the SLA cron needs (status + created_at together)
-- so the WHERE status = 'New Lead' ORDER BY created_at query is an index scan.
CREATE INDEX IF NOT EXISTS idx_leads_status_created
  ON leads (status, created_at DESC);
