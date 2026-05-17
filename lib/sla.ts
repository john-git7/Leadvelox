import { DecayStatus } from './orchestration';

export type SLAStatus = 'HEALTHY' | 'WARNING' | 'BREACHED';
export type EventSeverity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export const SLA_THRESHOLDS = {
  RESPONSE_MINUTES: 5, // Default; overridden by system_settings.sla_response_minutes
  FOLLOW_UP_HOURS: 2,
  INACTIVITY_THRESHOLD_HOURS: 24,
};

export const BUSINESS_HOURS = {
  START_HOUR: 9,
  END_HOUR: 17,
  /**
   * IANA timezone string. Using a named timezone means Intl handles
   * EST (UTC-5) vs EDT (UTC-4) transitions automatically — no DST bugs.
   */
  TIMEZONE: 'America/New_York',
};

/**
 * Returns the local hour and whether the date falls on a weekend,
 * using the Intl API against the configured IANA timezone.
 * This correctly handles Daylight Saving Time.
 */
function getLocalInfo(date: Date): { hour: number; isWeekend: boolean } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_HOURS.TIMEZONE,
    hour: 'numeric',
    weekday: 'short',
    hour12: false,
  }).formatToParts(date);

  const hourRaw = parts.find(p => p.type === 'hour')?.value ?? '0';
  // Intl hour12:false returns '24' for midnight in some environments; normalise.
  const hour = parseInt(hourRaw, 10) % 24;
  const weekday = parts.find(p => p.type === 'weekday')?.value ?? '';

  return { hour, isWeekend: weekday === 'Sat' || weekday === 'Sun' };
}

/**
 * Returns the UTC time that corresponds to START_HOUR on a given date in the
 * business timezone. Walks forward in 1-hour steps from midnight UTC until
 * Intl reports the correct local hour — robust against DST gaps/overlaps.
 */
function getUtcFor9AM(dateUtc: Date): Date {
  // Start from midnight UTC of that day
  const base = new Date(Date.UTC(
    dateUtc.getUTCFullYear(),
    dateUtc.getUTCMonth(),
    dateUtc.getUTCDate(),
    0, 0, 0, 0
  ));

  // Walk forward until local hour equals START_HOUR
  for (let h = 0; h <= 47; h++) {
    const candidate = new Date(base.getTime() + h * 60 * 60 * 1000);
    const { hour } = getLocalInfo(candidate);
    if (hour === BUSINESS_HOURS.START_HOUR) return candidate;
  }

  // Fallback: return base + typical offset (should never reach here)
  return new Date(base.getTime() + (BUSINESS_HOURS.START_HOUR + 5) * 60 * 60 * 1000);
}

/**
 * Adjust date to business hours. If the date falls outside Mon–Fri 09:00–17:00
 * in the configured timezone, advances to the next valid business-hour start.
 */
export function advanceToBusinessHours(date: Date, enforce: boolean = true): Date {
  if (!enforce) return date;

  const { hour, isWeekend } = getLocalInfo(date);
  const isBeforeHours = hour < BUSINESS_HOURS.START_HOUR;
  const isAfterHours = hour >= BUSINESS_HOURS.END_HOUR;

  if (!isWeekend && !isBeforeHours && !isAfterHours) {
    return date; // Already within business hours
  }

  // Move to the next calendar day if we're after-hours or on a weekend.
  // If before hours on a weekday, stay on the same day.
  let candidate = new Date(date);
  if (isAfterHours || isWeekend) {
    candidate = new Date(candidate.getTime() + 24 * 60 * 60 * 1000);
  }

  // Skip additional weekend days
  for (let i = 0; i < 7; i++) {
    const { isWeekend: isCandidateWeekend } = getLocalInfo(candidate);
    if (!isCandidateWeekend) break;
    candidate = new Date(candidate.getTime() + 24 * 60 * 60 * 1000);
  }

  return getUtcFor9AM(candidate);
}

/**
 * Calculates the response deadline based on lead creation time and the
 * configured SLA response window, adjusted for business hours.
 */
export function calculateResponseDeadline(
  createdAt: string,
  enforceBusinessHours: boolean = true,
  responseMinutes: number = SLA_THRESHOLDS.RESPONSE_MINUTES
): string {
  const created = new Date(createdAt);
  const adjusted = advanceToBusinessHours(created, enforceBusinessHours);
  return new Date(adjusted.getTime() + responseMinutes * 60 * 1000).toISOString();
}

/**
 * Evaluates the current SLA status of a lead.
 */
export function evaluateSLA(
  createdAt: string,
  responseDeadline: string | null,
  lastContactedAt: string | null,
  status: string
): { status: SLAStatus; breachedAt: string | null; escalationLevel: number } {
  const now = new Date().getTime();
  const deadline = responseDeadline ? new Date(responseDeadline).getTime() : null;

  // If already contacted, initial-response SLA is met
  if (status !== 'New Lead' || lastContactedAt) {
    return { status: 'HEALTHY', breachedAt: null, escalationLevel: 0 };
  }

  if (deadline && now > deadline) {
    return {
      status: 'BREACHED',
      breachedAt: new Date(deadline).toISOString(),
      escalationLevel: 1,
    };
  }

  // Warning state if within 2 minutes of deadline
  if (deadline && now > deadline - 2 * 60 * 1000) {
    return { status: 'WARNING', breachedAt: null, escalationLevel: 0 };
  }

  return { status: 'HEALTHY', breachedAt: null, escalationLevel: 0 };
}

/**
 * Maps decay status to event severity for logging.
 */
export function getSeverityForDecay(status: DecayStatus): EventSeverity {
  switch (status) {
    case 'HOT': return 'INFO';
    case 'WARM': return 'LOW';
    case 'COLD': return 'MEDIUM';
    case 'HIGH_RISK': return 'HIGH';
    default: return 'INFO';
  }
}
