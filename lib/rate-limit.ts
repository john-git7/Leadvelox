import { createAdminClient } from '@/lib/supabase/server';

/**
 * Rate limiting using a dedicated rate_limits table.
 *
 * Tracks requests by an opaque identifier (hashed IP or email).
 * Uses a sliding window: counts rows created within the last `windowMinutes`.
 *
 * PRODUCTION NOTE: For high-traffic deployments, replace this with Upstash Redis.
 * Supabase is acceptable at SMB volumes (<1000 req/hr on this endpoint).
 */
export async function checkRateLimit(
  identifier: string,
  limit: number = 5,
  windowMinutes: number = 15
): Promise<boolean> {
  const supabase = await createAdminClient();
  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();

  // Count recent requests from this identifier within the sliding window
  const { count, error } = await supabase
    .from('rate_limits')
    .select('*', { count: 'exact', head: true })
    .eq('identifier', identifier)
    .gt('created_at', windowStart);

  if (error) {
    // Fail open — do not block legitimate users if DB check fails
    console.error('[checkRateLimit] DB error:', error.message);
    return true;
  }

  const requestCount = count ?? 0;
  if (requestCount >= limit) {
    return false; // Rate limit exceeded
  }

  // Record this request (fire-and-forget is acceptable here)
  await supabase.from('rate_limits').insert([{ identifier }]);

  // Prune old entries for this identifier to prevent unbounded table growth
  supabase
    .from('rate_limits')
    .delete()
    .eq('identifier', identifier)
    .lt('created_at', windowStart)
    .then(() => {/* ignore */});

  return true;
}
