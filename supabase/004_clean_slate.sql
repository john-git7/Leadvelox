-- RUN THIS IN YOUR SUPABASE SQL EDITOR TO WIPE DEMO DATA
-- This will delete all fake leads, events, and automation logs.
-- It leaves your settings and agent profiles intact.

-- 1. Delete all automation events
DELETE FROM automation_events;

-- 2. Delete all lead events (the audit trails)
DELETE FROM lead_events;

-- 3. Delete all leads
DELETE FROM leads;

-- 4. Delete all lead groups (duplicate detection)
DELETE FROM lead_groups;

-- (Optional) Reset the ID sequence if you are using auto-incrementing IDs, 
-- though Supabase UUIDs do not require sequence resetting.
