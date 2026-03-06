-- Add note, source_url, source_type to signups table
ALTER TABLE signups ADD COLUMN note TEXT;
ALTER TABLE signups ADD COLUMN source_url TEXT;
ALTER TABLE signups ADD COLUMN source_type TEXT;
