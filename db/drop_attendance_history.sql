-- One-off: drop deprecated attendance_history table (run once on existing deployments).
-- Usage: wrangler d1 execute <DB_NAME> --file=db/drop_attendance_history.sql
DROP TABLE IF EXISTS attendance_history;
