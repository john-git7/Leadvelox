'use server';

import { headers } from 'next/headers';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { revalidatePath, unstable_cache } from 'next/cache';
import { leadSchema } from '@/lib/validations';
import { calculateDecayStatus, calculateUrgencyScore, logLeadEvent, triggerOrchestration } from '@/lib/orchestration';
import { calculateResponseDeadline, getSeverityForDecay } from '@/lib/sla';
import { checkRateLimit } from '@/lib/rate-limit';

/**
 * AUTHENTICATION GUARD
 */
type UserRole = 'ADMIN' | 'MANAGER' | 'AGENT';

async function assertAuth() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Unauthorized');
  return { supabase, user };
}

async function assertRole(allowedRoles: UserRole[]) {
  const { supabase, user } = await assertAuth();
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (error || !profile || !allowedRoles.includes(profile.role as UserRole)) {
    throw new Error(`Access Denied: Only ${allowedRoles.join(' or ')} can perform this action.`);
  }

  return { supabase, user, role: profile.role as UserRole };
}

/**
 * FEATURE 1: LEAD INTAKE ENGINE
 */
export async function submitLead(formData: FormData) {
  // --- RATE LIMIT GUARD ---
  // Identify caller by IP. Use hashed email as fallback if IP is unavailable.
  // Limit: 5 submissions per 15-minute sliding window per identifier.
  const headersList = await headers();
  const forwardedFor = headersList.get('x-forwarded-for');
  const realIp = headersList.get('x-real-ip');
  const identifier =
    (forwardedFor ? forwardedFor.split(',')[0].trim() : null) ??
    realIp ??
    'anonymous';

  const allowed = await checkRateLimit(identifier, 5, 15);
  if (!allowed) {
    return {
      success: false,
      error: 'Too many submissions. Please try again later.',
    };
  }

  const rawData = {
    name: formData.get('name'),
    email: formData.get('email'),
    phone: formData.get('phone'),
    source: formData.get('source'),
  };

  const validation = leadSchema.safeParse(rawData);
  if (!validation.success) {
    return { success: false, error: validation.error.issues[0].message };
  }

  const supabase = await createAdminClient();
  
  // Fetch dynamic system settings
  const { data: settings } = await supabase.from('system_settings').select('enforce_business_hours, sla_response_minutes').eq('id', 1).single();
  const enforceBusinessHours = settings ? settings.enforce_business_hours : true;
  const responseMinutes = settings?.sla_response_minutes ?? 5;

  const decayStatus = calculateDecayStatus(new Date().toISOString());
  const urgencyScore = calculateUrgencyScore(decayStatus);
  const responseDeadline = calculateResponseDeadline(new Date().toISOString(), enforceBusinessHours, responseMinutes);

  try {
    // Determine severity ahead of time based on decay, we'll adjust if duplicate in the DB or keep simple
    // Actually, RPC handles duplicate detection but we need description.
    // Let's pass generic intake description to RPC, and let the DB return if it was duplicate.
    const severity = getSeverityForDecay(decayStatus);
    const description = `New lead captured via ${validation.data.source}`;

    // Use Postgres Transaction via RPC
    const { data: rpcData, error: rpcError } = await supabase.rpc('insert_lead_intake', {
      p_name: validation.data.name,
      p_email: validation.data.email,
      p_phone: validation.data.phone,
      p_source: validation.data.source,
      p_decay_status: decayStatus,
      p_urgency_score: urgencyScore,
      p_response_deadline: responseDeadline,
      p_severity: severity,
      p_description: description
    });

    if (rpcError) throw rpcError;

    const leadId = rpcData.lead_id;
    const isDuplicate = rpcData.is_duplicate;

    // Fetch the inserted lead to pass to orchestration
    const { data: lead } = await supabase.from('leads').select('*').eq('id', leadId).single();

    if (isDuplicate) {
       // Log additional warning if duplicate
       await logLeadEvent(leadId, 'Intake', `Repeated inquiry detected from ${lead.name} (Source: ${lead.source}). Flagged as Potential Duplicate.`, 'MEDIUM', { is_duplicate: true });
    }

    // 4. Trigger Orchestration
    await triggerOrchestration(lead.id, lead);

    return { success: true, data: lead };
  } catch (err) {
    console.error('Submission error:', err);
    return { success: false, error: 'Operational failure during intake.' };
  }
}

/**
 * FEATURE 7: EVENT TIMELINE RETRIEVAL
 */
export async function getLeadEvents(leadId: string) {
  const { supabase } = await assertAuth();
  const { data } = await supabase
    .from('lead_events')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(50);
  return data || [];
}

/**
 * FEATURE 5: AUTOMATION HEALTH MONITORING
 */
export async function getAutomationHealth() {
  const { supabase, role } = await assertRole(['ADMIN', 'MANAGER', 'AGENT']);
  
  const { data } = await supabase
    .from('automation_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
  return (data as any[]) || [];
}

/**
 * DASHBOARD DATA FETCH — Server-side paginated with DB-level search and filter
 *
 * Returns { leads, totalCount } so the UI can show real pagination controls
 * without loading all rows into memory.
 *
 * Default PAGE_SIZE is intentionally small (20) to keep initial load fast.
 */
export async function getLeads({ 
  page = 0, 
  pageSize = 20, 
  search = '', 
  statusFilter = 'All',
  startDate,
  endDate,
  timezoneOffset = 0
}: { 
  page?: number, 
  pageSize?: number, 
  search?: string, 
  statusFilter?: string,
  startDate?: string,
  endDate?: string,
  timezoneOffset?: number
} = {}) {
  const { supabase, role, user } = await assertRole(['ADMIN', 'MANAGER', 'AGENT']);

  let query = supabase
    .from('leads')
    .select(
      'id, name, email, phone, source, status, urgency_score, decay_status, is_duplicate, response_deadline, sla_status, sla_breached_at, created_at, escalation_level, last_acknowledged_at, last_contacted_at, assigned_agent_id, delete_requested, lead_groups(primary_email, primary_phone)',
      { count: 'exact' }
    );

  // RBAC for AGENT
  if (role === 'AGENT') {
    query = query.or(`assigned_agent_id.eq.${user.id},assigned_agent_id.is.null`);
  }

  // DB-level search
  if (search.trim()) {
    const term = search.trim();
    query = query.or(`name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
  }

  // Status filter
  if (statusFilter && statusFilter !== 'All') {
    if (statusFilter === 'Delete Requested') {
      query = query.eq('delete_requested', true);
    } else {
      query = query.eq('status', statusFilter as string);
    }
  }

  // Date filters (adjusting for client timezone)
  if (startDate) {
    const [year, month, day] = startDate.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCMinutes(date.getUTCMinutes() + timezoneOffset);
    query = query.gte('created_at', date.toISOString());
  }
  if (endDate) {
    const [year, month, day] = endDate.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
    date.setUTCMinutes(date.getUTCMinutes() + timezoneOffset);
    query = query.lte('created_at', date.toISOString());
  }

  const { data, count, error } = await query
    .order('urgency_score', { ascending: false })
    .order('created_at', { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1);

  if (error) {
    console.error('getLeads error:', error);
    return { leads: [], totalCount: 0, currentUserRole: role };
  }

  const leads = (data ?? []).map(lead => {
    let duplicate_reason = null;
    if (lead.is_duplicate && lead.lead_groups) {
      const lg = Array.isArray(lead.lead_groups) ? lead.lead_groups[0] : lead.lead_groups;
      if (lg) {
        const eMatch = lg.primary_email === lead.email;
        const pMatch = lg.primary_phone === lead.phone;
        if (eMatch && pMatch) duplicate_reason = 'Email & Phone';
        else if (eMatch) duplicate_reason = 'Email';
        else if (pMatch) duplicate_reason = 'Phone';
      }
    }
    const { lead_groups, ...rest } = lead as any;
    return { ...rest, duplicate_reason };
  });

  return {
    leads: leads,
    totalCount: count || 0,
    currentUserRole: role,
    currentUserId: user.id
  };
}

/**
 * FEATURE: REQUEST LEAD DELETION
 * Agents use this to flag a lead for deletion by a manager.
 */
export async function requestLeadDeletion(leadId: string) {
  const { supabase, role, user } = await assertRole(['ADMIN', 'MANAGER', 'AGENT']);
  
  if (role === 'AGENT') {
    const { data: lead } = await supabase.from('leads').select('assigned_agent_id').eq('id', leadId).single();
    if (lead?.assigned_agent_id !== user.id) {
      return { success: false, error: 'Access Denied: Agents can only delete their own assigned leads.' };
    }
  }

  const { error } = await supabase
    .from('leads')
    .update({ delete_requested: true })
    .eq('id', leadId);

  if (error) return { success: false, error: error.message };

  await logLeadEvent(leadId, 'System', `${role} (${user.email}) requested lead deletion.`, 'LOW');
  revalidatePath('/');
  return { success: true };
}

/**
 * FEATURE: BULK DELETE LEADS
 * Only ADMIN or MANAGER can permanently bulk delete.
 */
export async function bulkDeleteLeads(leadIds: string[]) {
  const { supabase, user } = await assertRole(['ADMIN', 'MANAGER']);
  
  if (!leadIds.length) return { success: false, error: 'No leads provided' };

  const { error } = await supabase
    .from('leads')
    .delete()
    .in('id', leadIds);

  if (error) return { success: false, error: error.message };

  revalidatePath('/');
  return { success: true };
}



export async function getBreachedLeads() {
  // All roles may see breach counts — required for the global SLA banner.
  // Using assertRole instead of assertAuth keeps the pattern consistent and
  // ensures only actual operator accounts (with a profiles row) can read PII.
  await assertRole(['ADMIN', 'MANAGER', 'AGENT']);
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('sla_status', 'BREACHED')
    .in('status', ['New Lead'])
    .order('sla_breached_at', { ascending: true })
    .limit(50);

  if (error) {
    console.error('Failed to fetch breached leads', error);
  }

  return data || [];
}

/**
 * AGGREGATE STATS — Used by CommandCenter header cards
 * Fetches counts server-side; not affected by pagination.
 */
export async function getLeadStats() {
  // Use assertRole for consistency — getLeadStats is called from the dashboard
  // which is already role-gated, but this keeps the server-action layer safe
  // if the function is ever called from a new context.
  const { supabase } = await assertRole(['ADMIN', 'MANAGER', 'AGENT']);

  const [total, hot, highRisk, duplicates, uncontacted] = await Promise.all([
    supabase.from('leads').select('*', { count: 'exact', head: true }),
    // Only count HOT leads that are still uncontacted — contacted HOT leads are no longer urgent
    supabase.from('leads').select('*', { count: 'exact', head: true }).eq('decay_status', 'HOT').eq('status', 'New Lead'),
    // HIGH_RISK / BREACHED only relevant for uncontacted leads
    supabase.from('leads').select('*', { count: 'exact', head: true }).eq('status', 'New Lead').or('decay_status.eq.HIGH_RISK,sla_status.eq.BREACHED'),
    supabase.from('leads').select('*', { count: 'exact', head: true }).eq('is_duplicate', true),
    supabase.from('leads').select('*', { count: 'exact', head: true }).eq('status', 'New Lead'),
  ]);

  return {
    total: total.count ?? 0,
    hot: hot.count ?? 0,
    highRisk: highRisk.count ?? 0,
    duplicates: duplicates.count ?? 0,
    uncontacted: uncontacted.count ?? 0,
  };
}

/**
 * LEAD STATUS MANAGEMENT
 */
export async function updateLeadStatus(id: string, status: string, note?: string) {
  const { supabase, user } = await assertAuth();
  
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const role = profile?.role as UserRole || 'AGENT';
  const { data: lead } = await supabase.from('leads').select('status').eq('id', id).single();

  // One-way state machine for AGENTS
  if (role === 'AGENT' && lead?.status !== 'New Lead' && status === 'New Lead') {
    return { success: false, error: 'Access Denied: Only ADMIN or MANAGER can revert a contacted lead back to New Lead.' };
  }

  // Mandatory notes for AGENTS moving out of New Lead
  if (role === 'AGENT' && lead?.status === 'New Lead' && status !== 'New Lead') {
    if (!note || note.trim().length < 20) {
      return { success: false, error: 'Access Denied: Agents are required to provide a minimum 20-character contact outcome note.' };
    }
  }

  const statusUpdate: Record<string, string | null> = { status };

  if (status !== 'New Lead') {
    statusUpdate.last_contacted_at = new Date().toISOString();
    statusUpdate.sla_status = 'HEALTHY';
    statusUpdate.sla_breached_at = null;
  }

  const { error } = await supabase
    .from('leads')
    .update(statusUpdate)
    .eq('id', id);

  if (error) return { success: false, error: error.message };

  const logMessage = note 
    ? `Status updated to ${status}. Outcome: ${note}`
    : `Status updated to ${status}`;

  await logLeadEvent(id, 'Status Change', logMessage);
  revalidatePath('/dashboard');
  return { success: true };
}

/**
 * ACKNOWLEDGE SLA ALERT
 * Sets last_acknowledged_at so the Inngest cron respects the suppression window
 * and does not immediately re-escalate the same lead.
 */
export async function acknowledgeAlert(id: string) {
  const { supabase, user, role } = await assertRole(['ADMIN', 'MANAGER', 'AGENT']);

  // Agents may only acknowledge alerts for leads assigned to them.
  // ADMIN and MANAGER can acknowledge any lead.
  if (role === 'AGENT') {
    const { data: lead } = await supabase
      .from('leads')
      .select('assigned_agent_id')
      .eq('id', id)
      .single();

    if (lead?.assigned_agent_id !== user.id) {
      return {
        success: false,
        error: 'Access Denied: Agents can only acknowledge alerts on their own assigned leads.',
      };
    }
  }

  const { error } = await supabase
    .from('leads')
    .update({
      last_acknowledged_at: new Date().toISOString(),
      // Do NOT change sla_status or escalation_level: the SLA is still breached.
      // Acknowledging means "I know about this" — not "this is resolved", 
      // and we want to preserve the history of how far it escalated.
    })
    .eq('id', id);

  if (error) return { success: false };

  await logLeadEvent(id, 'System', 'Alert acknowledged by operator. Escalation suppressed for 30 minutes.', 'INFO');
  revalidatePath('/dashboard');
  return { success: true };
}

/**
 * DELETE LEAD
 */
export async function deleteLead(id: string) {
  let authz;
  try {
    authz = await assertRole(['ADMIN', 'MANAGER']);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Forbidden',
    };
  }

  const { supabase } = authz;
  const { error } = await supabase
    .from('leads')
    .delete()
    .eq('id', id);

  if (error) return { success: false };
  revalidatePath('/dashboard');
  return { success: true };
}

export async function getSystemSettings() {
  const { supabase } = await assertAuth();
  const { data } = await supabase.from('system_settings').select('*').eq('id', 1).single();
  return data || {
    agency_name: '',
    notification_target: '',
    enforce_business_hours: true,
    sla_response_minutes: 5,
    avg_deal_value: 1200,
    ack_suppression_minutes: 30,
  };
}

export async function toggleBusinessHours(enforce: boolean) {
  let authz;
  try {
    authz = await assertRole(['ADMIN', 'MANAGER']);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Forbidden',
    };
  }

  const { supabase } = authz;
  const { error } = await supabase
    .from('system_settings')
    .update({ enforce_business_hours: enforce })
    .eq('id', 1);

  if (error) return { success: false };
  revalidatePath('/dashboard');
  return { success: true };
}

export async function updateSystemSettings(formData: FormData) {
  let authz;
  try {
    authz = await assertRole(['ADMIN', 'MANAGER']);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Forbidden',
    };
  }

  const parsePositiveInt = (name: string, fallback: number) => {
    const rawValue = formData.get(name);
    const value = Number(rawValue);
    return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
  };

  const settings = {
    agency_name: String(formData.get('agency_name') ?? '').trim(),
    notification_target: String(formData.get('notification_target') ?? '').trim(),
    enforce_business_hours: formData.get('enforce_business_hours') === 'on',
    sla_response_minutes: parsePositiveInt('sla_response_minutes', 5),
    avg_deal_value: parsePositiveInt('avg_deal_value', 1200),
    ack_suppression_minutes: parsePositiveInt('ack_suppression_minutes', 30),
    updated_at: new Date().toISOString(),
  };

  const { supabase } = authz;
  const { error } = await supabase
    .from('system_settings')
    .upsert({ id: 1, ...settings });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/settings');
  return { success: true };
}

/**
 * DUPLICATE MANAGEMENT
 */
export async function getPotentialDuplicates() {
  const { supabase } = await assertAuth();
  const { data } = await supabase
    .from('leads')
    .select('id, name, email, phone, source, created_at, lead_groups(primary_email, primary_phone)')
    .eq('is_duplicate', true)
    .in('status', ['New Lead']);
    
  if (!data) return [];
  
  return data.map(lead => {
    let duplicate_reason = 'Unknown';
    if (lead.lead_groups) {
      const lg = Array.isArray(lead.lead_groups) ? lead.lead_groups[0] : lead.lead_groups;
      if (lg) {
        const eMatch = lg.primary_email === lead.email;
        const pMatch = lg.primary_phone === lead.phone;
        if (eMatch && pMatch) duplicate_reason = 'Email & Phone';
        else if (eMatch) duplicate_reason = 'Email';
        else if (pMatch) duplicate_reason = 'Phone';
      }
    }
    const { lead_groups, ...rest } = lead as any;
    return { ...rest, duplicate_reason };
  });
}

export async function resolveDuplicate(id: string, action: 'archive' | 'separate') {
  let authz;
  try {
    authz = await assertRole(['ADMIN', 'MANAGER']);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Forbidden',
    };
  }
  
  const { supabase } = authz;
  if (action === 'separate') {
    await supabase.from('leads').update({ is_duplicate: false }).eq('id', id);
    await logLeadEvent(id, 'System', 'Manually verified as distinct unique record', 'INFO');
  } else if (action === 'archive') {
    const { error } = await supabase.from('leads').update({ status: 'Closed' }).eq('id', id);
    if (error) return { success: false };
    await logLeadEvent(id, 'System', 'Duplicate record archived by operator. Review canonical lead for complete contact history.', 'INFO');
  }

  revalidatePath('/dashboard');
  return { success: true };
}

/**
 * AGENT MANAGEMENT — Fix 7
 *
 * Fetches all agent accounts (users with a profiles row) for the assignment
 * dropdown. Uses the admin client to access auth.admin.listUsers() so we can
 * surface real email addresses instead of UUIDs.
 */
const getAgentsCached = unstable_cache(
  async () => {
    const adminClient = await createAdminClient();

    const { data: { users }, error: usersError } = await adminClient.auth.admin.listUsers();
    if (usersError || !users) return [];

    // Fetch profiles to cross-reference roles
    const { data: profiles } = await adminClient
      .from('profiles')
      .select('id, role');

    const profileMap = new Map((profiles ?? []).map(p => [p.id, p.role]));

    return users
      .filter(u => profileMap.has(u.id)) // Only return users who have a profiles row (operators)
      .map(u => ({
        id: u.id,
        email: u.email || 'Unknown',
        role: profileMap.get(u.id) as string,
      }))
      .sort((a, b) => a.email.localeCompare(b.email));
  },
  ['agents-list'],
  { revalidate: 300 } // 5 minutes TTL
);

/**
 * FEATURE: ASSIGNMENT
 * Used by the CommandCenter to populate the "Assign to Agent" 
 * dropdown. Uses the admin client to access auth.admin.listUsers() so we can
 * surface real email addresses instead of UUIDs.
 */
export async function getAgents(): Promise<{ id: string; email: string; role: string }[]> {
  await assertAuth(); // Require logged-in user
  return getAgentsCached();
}

/**
 * ASSIGN LEAD — Fix 7
 *
 * Assigns a lead to an agent (or clears the assignment with null).
 * Any authenticated user may assign; RBAC rules for cross-agent assignment
 * can be added here in future.
 */
export async function assignLead(leadId: string, agentId: string | null) {
  const { supabase, user } = await assertAuth();

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  const role = profile?.role as UserRole || 'AGENT';

  let updateQuery = supabase.from('leads').update({ assigned_agent_id: agentId }).eq('id', leadId);

  if (role === 'AGENT') {
    if (agentId !== null) {
      // Trying to assign
      if (agentId !== user.id) {
        return { success: false, error: 'Access Denied: Agents can only assign leads to themselves.' };
      }
      // Atomic lock: Only update if it is currently unassigned OR already assigned to this agent
      updateQuery = updateQuery.or(`assigned_agent_id.is.null,assigned_agent_id.eq.${user.id}`);
    } else {
      // Trying to unassign
      // Atomic lock: Only allow unassigning if currently assigned to this agent
      updateQuery = updateQuery.eq('assigned_agent_id', user.id);
    }
  }

  const { data: updatedLeads, error } = await updateQuery.select('id');

  if (error) return { success: false, error: error.message };

  // If no rows were affected, the atomic condition failed (or lead doesn't exist)
  if (!updatedLeads || updatedLeads.length === 0) {
    if (role === 'AGENT') {
      return { 
        success: false, 
        error: agentId !== null 
          ? 'Too late, this lead was already claimed!' 
          : 'Access Denied: You cannot unassign a lead that belongs to someone else.' 
      };
    }
    return { success: false, error: 'Failed to update lead assignment.' };
  }

  let targetEmail = 'nobody';
  if (agentId) {
    const adminClient = await createAdminClient();
    const { data } = await adminClient.auth.admin.getUserById(agentId);
    if (data?.user?.email) {
      targetEmail = data.user.email;
    } else {
      targetEmail = `agent ${agentId.slice(0, 8)}…`;
    }
  }

  await logLeadEvent(
    leadId,
    'Assignment',
    agentId
      ? `Lead assigned to ${targetEmail} by ${user.email ?? user.id}`
      : `Lead unassigned by ${user.email ?? user.id}`,
    'INFO'
  );

  return { success: true };
}

/**
 * Fetch a single lead by its ID with duplicate details, matching getLeads.
 */
export async function getLead(id: string) {
  const { supabase } = await assertRole(['ADMIN', 'MANAGER', 'AGENT']);

  const { data: lead, error } = await supabase
    .from('leads')
    .select('id, name, email, phone, source, status, urgency_score, decay_status, is_duplicate, response_deadline, sla_status, sla_breached_at, created_at, escalation_level, last_acknowledged_at, last_contacted_at, assigned_agent_id, delete_requested, lead_groups(primary_email, primary_phone)')
    .eq('id', id)
    .single();

  if (error || !lead) {
    return null;
  }

  let duplicate_reason = null;
  if (lead.is_duplicate && lead.lead_groups) {
    const lg = Array.isArray(lead.lead_groups) ? lead.lead_groups[0] : lead.lead_groups;
    if (lg) {
      const eMatch = lg.primary_email === lead.email;
      const pMatch = lg.primary_phone === lead.phone;
      if (eMatch && pMatch) duplicate_reason = 'Email & Phone';
      else if (eMatch) duplicate_reason = 'Email';
      else if (pMatch) duplicate_reason = 'Phone';
    }
  }
  const { lead_groups, ...rest } = lead as any;
  return { ...rest, duplicate_reason };
}

/**
 * FEATURE: REJECT LEAD DELETION REQUEST
 * ADMIN and MANAGER only. Clears the delete_requested flag set by an agent,
 * keeping the lead active in the queue.
 */
export async function rejectLeadDeletion(leadId: string) {
  let authz;
  try {
    authz = await assertRole(['ADMIN', 'MANAGER']);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Forbidden',
    };
  }

  const { supabase, user, role } = authz;
  const { error } = await supabase
    .from('leads')
    .update({ delete_requested: false })
    .eq('id', leadId);

  if (error) return { success: false, error: error.message };

  await logLeadEvent(
    leadId,
    'System',
    `Deletion request rejected by ${role} (${user.email ?? user.id}). Lead remains active.`,
    'INFO'
  );

  revalidatePath('/dashboard');
  return { success: true };
}
