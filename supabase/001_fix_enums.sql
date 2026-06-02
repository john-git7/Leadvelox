-- RUN THIS SCRIPT FIRST
-- This fixes your database schema by adding missing status values to the lead_status enum.
-- You must run this separately from demo_seed.sql because Postgres requires new enum values to be committed before they can be used.

ALTER TYPE lead_status ADD VALUE IF NOT EXISTS 'Qualified';
ALTER TYPE lead_status ADD VALUE IF NOT EXISTS 'Lost';
ALTER TYPE lead_status ADD VALUE IF NOT EXISTS 'Closed';
