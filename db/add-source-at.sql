-- Add source_at column: timestamp of the source event (email sent date or web signup time).
-- Used by backfill to determine which action is most recent per game+player.
ALTER TABLE signups ADD COLUMN source_at TEXT;
