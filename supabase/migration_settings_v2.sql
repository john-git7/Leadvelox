-- ============================================================
-- MIGRATION: CLIENT PILOT SETTINGS
-- ============================================================

ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS agency_name TEXT DEFAULT '';
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS notification_target TEXT DEFAULT '';
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS sla_response_minutes INT NOT NULL DEFAULT 5;
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS avg_deal_value INT NOT NULL DEFAULT 1200;
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS ack_suppression_minutes INT NOT NULL DEFAULT 30;

UPDATE system_settings
SET
  agency_name = COALESCE(agency_name, ''),
  notification_target = COALESCE(notification_target, ''),
  sla_response_minutes = COALESCE(sla_response_minutes, 5),
  avg_deal_value = COALESCE(avg_deal_value, 1200),
  ack_suppression_minutes = COALESCE(ack_suppression_minutes, 30)
WHERE id = 1;
