const path = require("path");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");

let dbPromise;

async function initDb() {
  const dbPath = process.env.DATABASE_PATH || "./data/app.db";
  const resolvedDbPath = path.resolve(dbPath);
  const db = await open({
    filename: resolvedDbPath,
    driver: sqlite3.Database,
  });

  await db.exec("PRAGMA foreign_keys = ON;");

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'owner' CHECK(role IN ('owner', 'admin')),
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS businesses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      name TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      services TEXT NOT NULL DEFAULT '',
      working_hours TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      contact_phone TEXT NOT NULL DEFAULT '',
      whatsapp_phone_number_id TEXT UNIQUE,
      whatsapp_access_token TEXT NOT NULL DEFAULT '',
      plan TEXT NOT NULL DEFAULT 'free' CHECK(plan IN ('free', 'paid')),
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER,
      customer_phone TEXT NOT NULL,
      direction TEXT NOT NULL CHECK(direction IN ('inbound', 'outbound')),
      message_text TEXT NOT NULL,
      wa_message_id TEXT,
      source TEXT NOT NULL DEFAULT 'customer' CHECK(source IN ('customer', 'ai', 'system_limit', 'system')),
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS daily_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      usage_date TEXT NOT NULL,
      replies_sent INTEGER NOT NULL DEFAULT 0,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (business_id, usage_date),
      FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_messages_business_created
      ON messages (business_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_customer_phone
      ON messages (customer_phone);
    CREATE INDEX IF NOT EXISTS idx_daily_usage_business_date
      ON daily_usage (business_id, usage_date);
  `);

  return db;
}

async function getDb() {
  if (!dbPromise) {
    dbPromise = initDb();
  }
  return dbPromise;
}

module.exports = {
  getDb,
};
