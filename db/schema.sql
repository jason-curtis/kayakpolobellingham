-- Games table
CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  signup_deadline TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  game_on_notified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Signups table
CREATE TABLE IF NOT EXISTS signups (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  status TEXT NOT NULL,
  late INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  source_url TEXT,
  source_type TEXT,
  source_at TEXT,
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

-- Scrapes (Groups.io scrape runs; last_message_id for resume)
CREATE TABLE IF NOT EXISTS scrapes (
  id TEXT PRIMARY KEY,
  completed_at TEXT NOT NULL,
  last_message_id INTEGER NOT NULL,
  topics_scraped INTEGER NOT NULL,
  games_inserted INTEGER NOT NULL,
  signups_inserted INTEGER NOT NULL
);

-- In-progress scrape state (one row id='cursor'; games_json = accumulated games for resume)
CREATE TABLE IF NOT EXISTS scrape_cursor (
  id TEXT PRIMARY KEY,
  last_message_id INTEGER NOT NULL,
  games_json TEXT NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_signups_game ON signups(game_id);
CREATE INDEX IF NOT EXISTS idx_signups_player ON signups(player_name);
CREATE INDEX IF NOT EXISTS idx_games_date ON games(date);
