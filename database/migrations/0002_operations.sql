ALTER TABLE orders ADD COLUMN source TEXT NOT NULL DEFAULT 'app';
ALTER TABLE orders ADD COLUMN created_by TEXT;
CREATE INDEX IF NOT EXISTS idx_orders_source_created ON orders(source,created_at);

CREATE TABLE IF NOT EXISTS birthday_rewards (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  year INTEGER NOT NULL,
  redeemed_at TEXT NOT NULL,
  UNIQUE(user_id, year),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_birthday_rewards_user ON birthday_rewards(user_id,year);
