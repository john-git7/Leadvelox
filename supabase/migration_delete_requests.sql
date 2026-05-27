-- Run this in your Supabase Dashboard SQL Editor
ALTER TABLE leads
ADD COLUMN delete_requested BOOLEAN DEFAULT false;
