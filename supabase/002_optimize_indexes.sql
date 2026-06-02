-- RUN THIS IN YOUR SUPABASE SQL EDITOR TO OPTIMIZE PERFORMANCE
-- These indexes are specifically designed to speed up the Operational Event Stream and SLA Breach Analysis.

-- 1. Optimize SLA Breach Analysis
-- This creates a partial composite index. It only indexes leads that are currently breached and new.
-- This makes the getBreachedLeads() query absolutely instant, even if you have millions of leads.
CREATE INDEX IF NOT EXISTS idx_leads_active_breaches 
ON leads (sla_status, status, sla_breached_at) 
WHERE sla_status = 'BREACHED' AND status = 'New Lead';

-- 2. Optimize Operational Event Stream
-- This creates a composite index that not only filters by lead_id, but pre-sorts them by date.
-- This prevents the database from having to sort the events in memory during the getLeadEvents() query.
CREATE INDEX IF NOT EXISTS idx_lead_events_lead_id_created_at 
ON lead_events (lead_id, created_at DESC);
