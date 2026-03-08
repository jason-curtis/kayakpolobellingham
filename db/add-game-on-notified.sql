-- Track whether game-on notification email has been sent for each game
ALTER TABLE games ADD COLUMN game_on_notified INTEGER NOT NULL DEFAULT 0;
