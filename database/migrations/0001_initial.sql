PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT DEFAULT '',
  birthdate TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer' CHECK(role IN ('customer','staff','admin')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  category TEXT NOT NULL,
  price REAL NOT NULL DEFAULT 0,
  image_url TEXT DEFAULT '',
  available INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  fulfillment TEXT NOT NULL CHECK(fulfillment IN ('pickup','delivery')),
  payment_method TEXT NOT NULL CHECK(payment_method IN ('cash','card','transfer')),
  payment_status TEXT NOT NULL DEFAULT 'pending',
  total REAL NOT NULL DEFAULT 0,
  address TEXT,
  notes TEXT DEFAULT '',
  scheduled_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id,created_at);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status,created_at);

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  product_id TEXT,
  name TEXT NOT NULL,
  qty INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY(product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS loyalty_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  order_id TEXT,
  points INTEGER NOT NULL,
  type TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(order_id) REFERENCES orders(id)
);
CREATE INDEX IF NOT EXISTS idx_loyalty_user ON loyalty_ledger(user_id,created_at);

INSERT OR IGNORE INTO products (id,name,description,category,price,image_url,available,sort_order,created_at) VALUES
('espresso','Espresso','Café intenso y aromático.','Café',45,'',1,10,datetime('now')),
('americano','Americano','Espresso con agua caliente.','Café',52,'',1,20,datetime('now')),
('latte','Latte','Espresso con leche cremosa.','Café',68,'',1,30,datetime('now')),
('capuccino','Cappuccino','Espresso, leche y espuma sedosa.','Café',68,'',1,40,datetime('now')),
('coldbrew','Cold Brew','Extracción en frío, suave y refrescante.','Fríos',75,'',1,50,datetime('now')),
('matcha','Matcha Latte','Matcha ceremonial con leche.','Fríos',82,'',1,60,datetime('now')),
('croissant','Croissant','Hojaldre mantequilloso recién horneado.','Panadería',58,'',1,70,datetime('now')),
('sandwich','Sándwich Martie','Pan artesanal con relleno de temporada.','Comida',115,'',1,80,datetime('now'));
