import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

describe('insert_lead_intake migration', () => {
  it('does not match duplicate leads on empty phone strings', () => {
    const migration = readFileSync('supabase/migration_fixes_v2.sql', 'utf8');

    expect(migration).toContain("v_normalized_phone := NULLIF(BTRIM(p_phone), '')");
    expect(migration).toContain('v_normalized_phone IS NOT NULL');
    expect(migration).toContain('primary_phone = v_normalized_phone');
  });
});
