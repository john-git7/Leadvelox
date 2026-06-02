-- ============================================================
-- DEMO SEED DATA — LeadVelox Client Presentation
-- Run this in your Supabase SQL editor to populate demo data.
-- ============================================================

-- 1. CLEAR OLD DATA (preserves users/profiles)
TRUNCATE TABLE lead_events RESTART IDENTITY CASCADE;
TRUNCATE TABLE lead_groups RESTART IDENTITY CASCADE;
TRUNCATE TABLE automation_events RESTART IDENTITY CASCADE;
DELETE FROM leads;

-- 2. RESET SEQUENCES
ALTER SEQUENCE IF EXISTS lead_events_id_seq RESTART WITH 1;

-- 3. INSERT DEMO LEADS
-- Intentionally shows the full product story:
--   Hot lead converted fast (success)
--   Lead SLA-breached and escalated (risk)
--   Duplicate lead caught (protection)
--   Qualified pipeline lead (in-progress)
--   Lost lead (follow-up gap)

INSERT INTO leads (id, name, email, phone, source, status, urgency_score, decay_status, is_duplicate, response_deadline, sla_status, sla_breached_at, created_at, last_contacted_at, assigned_agent_id, escalation_level)
VALUES
  -- 🔥 HOT — Converted in record time (SUCCESS STORY)
  (
    'a1b2c3d4-0001-0000-0000-000000000001',
    'Marcus Webb',
    'marcus.webb@goldcapital.io',
    '+1 (305) 881-2244',
    'Website',
    'Closed',
    94,
    'HOT',
    false,
    (NOW() - INTERVAL '3 hours'),
    'HEALTHY',
    NULL,
    NOW() - INTERVAL '4 hours',
    NOW() - INTERVAL '3 hours 45 minutes',
    NULL,
    0
  ),

  -- ⚠ SLA BREACHED — Escalated to Level 3 (RISK DEMO)
  (
    'a1b2c3d4-0002-0000-0000-000000000002',
    'Priya Nair',
    'pnair@techbridge.co',
    '+1 (212) 555-7732',
    'LinkedIn',
    'New Lead',
    88,
    'HIGH_RISK',
    false,
    (NOW() - INTERVAL '90 minutes'),
    'BREACHED',
    (NOW() - INTERVAL '90 minutes'),
    NOW() - INTERVAL '2 hours',
    NULL,
    NULL,
    3
  ),

  -- ⊘ DUPLICATE CAUGHT — Same email as Marcus (PROTECTION DEMO)
  (
    'a1b2c3d4-0003-0000-0000-000000000003',
    'Marc Webb',
    'marcus.webb@goldcapital.io',
    '+1 (305) 881-2299',
    'Facebook Ad',
    'New Lead',
    61,
    'WARM',
    true,
    (NOW() + INTERVAL '1 hour'),
    'HEALTHY',
    NULL,
    NOW() - INTERVAL '30 minutes',
    NULL,
    NULL,
    0
  ),

  -- ✅ QUALIFIED — In pipeline (IN-PROGRESS DEMO)
  (
    'a1b2c3d4-0004-0000-0000-000000000004',
    'Danielle Okafor',
    'danielle@meridianpm.com',
    '+1 (646) 339-0011',
    'Referral',
    'Qualified',
    76,
    'WARM',
    false,
    (NOW() + INTERVAL '2 hours'),
    'HEALTHY',
    NULL,
    NOW() - INTERVAL '6 hours',
    NOW() - INTERVAL '5 hours 30 minutes',
    NULL,
    0
  ),

  -- ❌ LOST — Slow response caused dropout (FOLLOW-UP GAP DEMO)
  (
    'a1b2c3d4-0005-0000-0000-000000000005',
    'Tyler Roth',
    'tyler.roth@gmail.com',
    '+1 (404) 720-8831',
    'Google Ad',
    'Lost',
    42,
    'COLD',
    false,
    (NOW() - INTERVAL '5 hours'),
    'BREACHED',
    (NOW() - INTERVAL '5 hours'),
    NOW() - INTERVAL '8 hours',
    NOW() - INTERVAL '3 hours',
    NULL,
    4
  ),

  -- 🆕 FRESH HOT LEAD — Just came in (LIVE URGENCY DEMO)
  (
    'a1b2c3d4-0006-0000-0000-000000000006',
    'Sofia Mendes',
    'sofia.m@veritas-group.com',
    '+1 (786) 441-5500',
    'Instagram',
    'New Lead',
    91,
    'HOT',
    false,
    (NOW() + INTERVAL '3 minutes'),
    'HEALTHY',
    NULL,
    NOW() - INTERVAL '2 minutes',
    NULL,
    NULL,
    0
  ),

  -- 📋 CONTACTED — Being worked (PIPELINE DEMO)
  (
    'a1b2c3d4-0007-0000-0000-000000000007',
    'James Oduya',
    'j.oduya@bluepointventures.com',
    '+1 (917) 204-6622',
    'Cold Email',
    'Contacted',
    67,
    'WARM',
    false,
    (NOW() + INTERVAL '45 minutes'),
    'WARNING',
    NULL,
    NOW() - INTERVAL '1 hour',
    NOW() - INTERVAL '35 minutes',
    NULL,
    1
  );


-- 4. INSERT LEAD GROUPS (for duplicate detection display)
INSERT INTO lead_groups (id, primary_email, primary_phone, created_at)
VALUES
  ('f0000000-0000-0000-0000-000000000001', 'marcus.webb@goldcapital.io', '+1 (305) 881-2244', NOW() - INTERVAL '4 hours');

-- Mark the duplicate lead as part of the group
UPDATE leads SET lead_group_id = 'f0000000-0000-0000-0000-000000000001'
WHERE id IN (
  'a1b2c3d4-0001-0000-0000-000000000001',
  'a1b2c3d4-0003-0000-0000-000000000003'
);


-- 5. INSERT LEAD EVENTS (Timeline for each lead)

-- Marcus Webb — conversion timeline
INSERT INTO lead_events (lead_id, event_type, description, severity, created_at) VALUES
  ('a1b2c3d4-0001-0000-0000-000000000001', 'Intake', 'Lead received via website form. Urgency score: 94. Decay: HOT.', 'INFO', NOW() - INTERVAL '4 hours'),
  ('a1b2c3d4-0001-0000-0000-000000000001', 'Automation', 'Welcome email dispatched via n8n workflow. Delivery confirmed.', 'INFO', NOW() - INTERVAL '3 hours 58 minutes'),
  ('a1b2c3d4-0001-0000-0000-000000000001', 'Status Change', 'Status updated: New Lead → Contacted. Agent responded in 15 minutes.', 'INFO', NOW() - INTERVAL '3 hours 45 minutes'),
  ('a1b2c3d4-0001-0000-0000-000000000001', 'Status Change', 'Status updated: Contacted → Qualified. Outcome: Client confirmed budget and timeline.', 'INFO', NOW() - INTERVAL '2 hours 30 minutes'),
  ('a1b2c3d4-0001-0000-0000-000000000001', 'Status Change', 'Status updated: Qualified → Closed. Deal finalized. Revenue recognized.', 'INFO', NOW() - INTERVAL '1 hour 15 minutes');

-- Priya Nair — SLA breach escalation timeline
INSERT INTO lead_events (lead_id, event_type, description, severity, created_at) VALUES
  ('a1b2c3d4-0002-0000-0000-000000000002', 'Intake', 'Lead received via LinkedIn. Urgency score: 88. Flagged as high-priority.', 'INFO', NOW() - INTERVAL '2 hours'),
  ('a1b2c3d4-0002-0000-0000-000000000002', 'Automation', 'Automated acknowledgement email dispatched. Awaiting agent response.', 'INFO', NOW() - INTERVAL '1 hour 58 minutes'),
  ('a1b2c3d4-0002-0000-0000-000000000002', 'SLA Breach', 'Response deadline exceeded. Lead has not been contacted. Escalation triggered.', 'HIGH', NOW() - INTERVAL '1 hour 30 minutes'),
  ('a1b2c3d4-0002-0000-0000-000000000002', 'Workflow', 'Escalation L2: Lead surfaced to top of dashboard priority queue.', 'MEDIUM', NOW() - INTERVAL '1 hour 25 minutes'),
  ('a1b2c3d4-0002-0000-0000-000000000002', 'Workflow', 'Escalation L3: Manager notified via Slack webhook. Slack message delivered.', 'CRITICAL', NOW() - INTERVAL '1 hour 15 minutes');

-- Marc Webb — duplicate detection timeline
INSERT INTO lead_events (lead_id, event_type, description, severity, created_at) VALUES
  ('a1b2c3d4-0003-0000-0000-000000000003', 'Intake', 'Lead received via Facebook Ad. Urgency score: 61.', 'INFO', NOW() - INTERVAL '30 minutes'),
  ('a1b2c3d4-0003-0000-0000-000000000003', 'Workflow', 'Duplicate detection engine matched email: marcus.webb@goldcapital.io. Lead flagged for review.', 'MEDIUM', NOW() - INTERVAL '29 minutes 50 seconds');

-- Danielle Okafor — qualified pipeline
INSERT INTO lead_events (lead_id, event_type, description, severity, created_at) VALUES
  ('a1b2c3d4-0004-0000-0000-000000000004', 'Intake', 'Lead received via referral. High-trust source. Urgency score: 76.', 'INFO', NOW() - INTERVAL '6 hours'),
  ('a1b2c3d4-0004-0000-0000-000000000004', 'Automation', 'Personalized referral follow-up email dispatched within 2 minutes.', 'INFO', NOW() - INTERVAL '5 hours 58 minutes'),
  ('a1b2c3d4-0004-0000-0000-000000000004', 'Status Change', 'Status updated: New Lead → Contacted. Call completed. Notes: Interested in Q3 start.', 'INFO', NOW() - INTERVAL '5 hours 30 minutes'),
  ('a1b2c3d4-0004-0000-0000-000000000004', 'Status Change', 'Status updated: Contacted → Qualified. Budget confirmed: $2,400/mo. Follow-up scheduled.', 'INFO', NOW() - INTERVAL '4 hours');

-- Tyler Roth — lost due to slow response
INSERT INTO lead_events (lead_id, event_type, description, severity, created_at) VALUES
  ('a1b2c3d4-0005-0000-0000-000000000005', 'Intake', 'Lead received via Google Ad. Urgency score: 42 (moderate).', 'INFO', NOW() - INTERVAL '8 hours'),
  ('a1b2c3d4-0005-0000-0000-000000000005', 'SLA Breach', 'Response deadline exceeded. No agent contact made within SLA window.', 'HIGH', NOW() - INTERVAL '7 hours 30 minutes'),
  ('a1b2c3d4-0005-0000-0000-000000000005', 'Workflow', 'L2 escalation triggered. Dashboard alert surfaced.', 'MEDIUM', NOW() - INTERVAL '7 hours 15 minutes'),
  ('a1b2c3d4-0005-0000-0000-000000000005', 'Workflow', 'L3 escalation triggered. Manager notified.', 'CRITICAL', NOW() - INTERVAL '7 hours'),
  ('a1b2c3d4-0005-0000-0000-000000000005', 'Workflow', 'L4 critical escalation triggered. Lead 60+ minutes overdue. Webhook re-fired.', 'CRITICAL', NOW() - INTERVAL '6 hours'),
  ('a1b2c3d4-0005-0000-0000-000000000005', 'Status Change', 'Status updated: New Lead → Contacted. Agent reached out but lead had already moved to competitor.', 'HIGH', NOW() - INTERVAL '3 hours'),
  ('a1b2c3d4-0005-0000-0000-000000000005', 'Status Change', 'Status updated: Contacted → Lost. Outcome note: Lead said "found another provider already".', 'HIGH', NOW() - INTERVAL '2 hours 30 minutes');

-- Sofia Mendes — brand new, SLA ticking NOW
INSERT INTO lead_events (lead_id, event_type, description, severity, created_at) VALUES
  ('a1b2c3d4-0006-0000-0000-000000000006', 'Intake', 'Lead received via Instagram ad. Urgency score: 91. SLA window: 5 minutes.', 'INFO', NOW() - INTERVAL '2 minutes'),
  ('a1b2c3d4-0006-0000-0000-000000000006', 'Automation', 'Instant acknowledgement email dispatched via n8n. Response time: 3 seconds.', 'INFO', NOW() - INTERVAL '1 minute 57 seconds');

-- James Oduya — contacted, SLA warning
INSERT INTO lead_events (lead_id, event_type, description, severity, created_at) VALUES
  ('a1b2c3d4-0007-0000-0000-000000000007', 'Intake', 'Lead received via cold email campaign. Urgency score: 67.', 'INFO', NOW() - INTERVAL '1 hour'),
  ('a1b2c3d4-0007-0000-0000-000000000007', 'Automation', 'Automated follow-up dispatched. Campaign: Q2 Property Outreach.', 'INFO', NOW() - INTERVAL '58 minutes'),
  ('a1b2c3d4-0007-0000-0000-000000000007', 'Workflow', 'L1 warning: Response approaching SLA threshold. Dashboard indicator active.', 'MEDIUM', NOW() - INTERVAL '55 minutes'),
  ('a1b2c3d4-0007-0000-0000-000000000007', 'Status Change', 'Status updated: New Lead → Contacted. Intro call completed. Notes: Interested, needs budget approval.', 'INFO', NOW() - INTERVAL '35 minutes');


-- 6. INSERT AUTOMATION EVENTS (Workflow Health Panel)
INSERT INTO automation_events (lead_id, workflow_name, status, duration_ms, error_message, created_at, payload) VALUES
  ('a1b2c3d4-0001-0000-0000-000000000001', 'lead_intake_welcome_email', 'Success', 312, NULL, NOW() - INTERVAL '3 hours 58 minutes', '{"to": "marcus.webb@goldcapital.io", "template": "welcome_v2", "delivered": true}'),
  ('a1b2c3d4-0006-0000-0000-000000000006', 'lead_intake_welcome_email', 'Success', 298, NULL, NOW() - INTERVAL '1 minute 57 seconds', '{"to": "sofia.m@veritas-group.com", "template": "welcome_v2", "delivered": true}'),
  ('a1b2c3d4-0002-0000-0000-000000000002', 'sla_escalation_manager_webhook', 'Success', 541, NULL, NOW() - INTERVAL '1 hour 15 minutes', '{"channel": "#sales-alerts", "message": "CRITICAL: Priya Nair has not been contacted. 90 min overdue.", "delivered": true}'),
  ('a1b2c3d4-0005-0000-0000-000000000005', 'sla_escalation_manager_webhook', 'Failed', 4200, 'Slack API error: channel not found (#sales-critical). Webhook aborted.', NOW() - INTERVAL '6 hours', '{"channel": "#sales-critical", "attempted": true}'),
  ('a1b2c3d4-0007-0000-0000-000000000007', 'lead_intake_welcome_email', 'Success', 405, NULL, NOW() - INTERVAL '58 minutes', '{"to": "j.oduya@bluepointventures.com", "template": "outreach_v1", "delivered": true}'),
  ('a1b2c3d4-0004-0000-0000-000000000004', 'lead_intake_welcome_email', 'Success', 287, NULL, NOW() - INTERVAL '5 hours 58 minutes', '{"to": "danielle@meridianpm.com", "template": "referral_v1", "delivered": true}'),
  ('a1b2c3d4-0003-0000-0000-000000000003', 'duplicate_detection_engine', 'Success', 89, NULL, NOW() - INTERVAL '29 minutes 50 seconds', '{"matched_field": "email", "existing_lead_id": "a1b2c3d4-0001-0000-0000-000000000001", "flagged": true}'),
  (NULL, 'cron_sla_checker', 'Success', 156, NULL, NOW() - INTERVAL '5 minutes', '{"leads_checked": 7, "breaches_detected": 2, "escalations_triggered": 1}');


-- 7. VERIFY DATA
SELECT 
  name, 
  status, 
  decay_status, 
  sla_status, 
  escalation_level,
  is_duplicate,
  urgency_score
FROM leads 
ORDER BY created_at DESC;
