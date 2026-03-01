-- Games table
CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  signup_deadline TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Signups table
CREATE TABLE IF NOT EXISTS signups (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (game_id) REFERENCES games(id),
  UNIQUE(game_id, player_name)
);

-- Regulars table
CREATE TABLE IF NOT EXISTS regulars (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  aliases TEXT,
  created_at TEXT NOT NULL
);

-- Attendance history (for extra credit analytics)
CREATE TABLE IF NOT EXISTS attendance_history (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  status TEXT NOT NULL,
  email_source TEXT,
  parsed_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (game_id) REFERENCES games(id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_signups_game ON signups(game_id);
CREATE INDEX IF NOT EXISTS idx_signups_player ON signups(player_name);
CREATE INDEX IF NOT EXISTS idx_games_date ON games(date);
CREATE INDEX IF NOT EXISTS idx_attendance_game ON attendance_history(game_id);
