import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabaseState = vi.hoisted(() => ({
  role: 'AGENT',
  deletedLeadId: null as string | null,
  updatedSettings: null as { enforce_business_hours: boolean } | null,
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  unstable_cache: (fn: any) => fn,
}));

vi.mock('../lib/orchestration', () => ({
  calculateDecayStatus: vi.fn(),
  calculateUrgencyScore: vi.fn(),
  logLeadEvent: vi.fn(),
  triggerOrchestration: vi.fn(),
}));

vi.mock('../lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: 'user-1' } },
        error: null,
      })),
    },
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { role: supabaseState.role },
                error: null,
              }),
            }),
          }),
        };
      }

      if (table === 'leads') {
        return {
          delete: () => ({
            eq: async (_column: string, id: string) => {
              supabaseState.deletedLeadId = id;
              return { error: null };
            },
          }),
        };
      }

      if (table === 'system_settings') {
        return {
          update: (payload: { enforce_business_hours: boolean }) => ({
            eq: async () => {
              supabaseState.updatedSettings = payload;
              return { error: null };
            },
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  })),
  createAdminClient: vi.fn(),
}));

describe('lead mutation RBAC', () => {
  beforeEach(() => {
    supabaseState.role = 'AGENT';
    supabaseState.deletedLeadId = null;
    supabaseState.updatedSettings = null;
  });

  it('rejects destructive actions for AGENT users', async () => {
    const { deleteLead, toggleBusinessHours } = await import('../app/actions/leads');

    await expect(deleteLead('lead-1')).resolves.toEqual({
      success: false,
      error: 'Access Denied: Only ADMIN or MANAGER can perform this action.',
    });
    await expect(toggleBusinessHours(false)).resolves.toEqual({
      success: false,
      error: 'Access Denied: Only ADMIN or MANAGER can perform this action.',
    });

    expect(supabaseState.deletedLeadId).toBeNull();
    expect(supabaseState.updatedSettings).toBeNull();
  });

  it('permits destructive actions for MANAGER users', async () => {
    supabaseState.role = 'MANAGER';
    const { deleteLead, toggleBusinessHours } = await import('../app/actions/leads');

    await expect(deleteLead('lead-1')).resolves.toEqual({ success: true });
    await expect(toggleBusinessHours(false)).resolves.toEqual({ success: true });

    expect(supabaseState.deletedLeadId).toBe('lead-1');
    expect(supabaseState.updatedSettings).toEqual({ enforce_business_hours: false });
  });
});
