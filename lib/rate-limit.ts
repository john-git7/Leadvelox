import { createAdminClient } from '@/lib/supabase/server';

/**
 * Rate limiting via an atomic PostgreSQL function.
 *
 * Delegates to check_rate_limit() (defined in 010_rate_limit_atomic.sql),
 * which uses pg_advisory_xact_lock to make the entire prune → count → insert
 * sequence atomic. This eliminates the COUNT → compare → INSERT race condition
 * that allowed concurrent requests from the same identifier to slip through.
 *
 * Sliding window: requests created within the last `windowMinutes`.
 *
 * PRODUCTION NOTE: For very high traffic (> 1,000 req/hr on intake),
 * replace this with Upstash Redis. Advisory locks are safe at SMB volumes.
 */
export async function checkRateLimit(
  identifier: string,
  limit: number = 5,
  windowMinutes: number = 15
): Promise<boolean> {
  const supabase = await createAdminClient();

  const { data, error } = await supabase.rpc('check_rate_limit', {
    p_identifier: identifier,
    p_limit: limit,
    p_window_min: windowMinutes,
  });

  if (error) {
    // Fail open — do not block legitimate users if the DB check itself fails.
    console.error('[checkRateLimit] DB error:', error.message);
    return true;
  }

  // The PG function returns TRUE = allowed, FALSE = rate limit exceeded.
  return data === true;
}
