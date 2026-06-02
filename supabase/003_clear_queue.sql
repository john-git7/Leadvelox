-- RUN THIS IN YOUR SUPABASE SQL EDITOR TO CLEAR THE RETRY QUEUE
-- This will wipe out any stuck notifications that are endlessly looping or overlapping.

DELETE FROM automation_events WHERE status IN ('Retrying', 'Failed');
