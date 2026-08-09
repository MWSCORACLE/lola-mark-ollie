import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(here, "..", "data");
fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(path.join(dataDir, "lola-mark-ollie.db"));
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,            -- YYYY-MM-DD
  time TEXT,                     -- HH:MM, optional
  title TEXT NOT NULL,
  who TEXT NOT NULL CHECK (who IN ('lola','mark','ollie','shared')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);

CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  author TEXT NOT NULL CHECK (author IN ('lola','mark')),
  love_note TEXT,
  mood TEXT,
  feeling_text TEXT,
  excited TEXT,
  thought TEXT,
  goal_checkin TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(date, author)
);
CREATE INDEX IF NOT EXISTS idx_entries_date ON entries(date);

CREATE TABLE IF NOT EXISTS ollie_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE,
  text TEXT NOT NULL,
  author TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  detail TEXT,
  target_value REAL,
  current_value REAL DEFAULT 0,
  unit TEXT,
  done INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS recaps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_end TEXT NOT NULL UNIQUE,  -- Sunday date YYYY-MM-DD
  body TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'local',  -- 'local' or 'claude'
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- ---------- Rental hunt ----------
CREATE TABLE IF NOT EXISTS rentals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  address TEXT,
  url TEXT,
  beds REAL,
  baths REAL,
  sqft INTEGER,
  toured_on TEXT,                -- YYYY-MM-DD
  rating INTEGER,                -- 1-5, how much you liked it
  status TEXT NOT NULL DEFAULT 'toured'
    CHECK (status IN ('toured','shortlist','applied','passed','chosen')),
  -- monthly costs
  rent REAL NOT NULL DEFAULT 0,
  utilities REAL NOT NULL DEFAULT 0,   -- electric, gas, water, trash
  internet REAL NOT NULL DEFAULT 0,
  insurance REAL NOT NULL DEFAULT 0,   -- renters insurance
  pet_rent REAL NOT NULL DEFAULT 0,    -- Ollie's rent
  parking REAL NOT NULL DEFAULT 0,
  other_monthly REAL NOT NULL DEFAULT 0, -- amenity/HOA/storage fees
  commute REAL NOT NULL DEFAULT 0,     -- gas, tolls, transit for both of you
  -- one-time move-in costs
  deposit REAL NOT NULL DEFAULT 0,
  pet_deposit REAL NOT NULL DEFAULT 0,
  application_fee REAL NOT NULL DEFAULT 0,
  move_in_other REAL NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS incomes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  who TEXT NOT NULL CHECK (who IN ('lola','mark','shared')),
  label TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,   -- average monthly take-home
  gross_amount REAL,                -- average monthly before tax, optional
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Other',
  amount REAL NOT NULL DEFAULT 0,   -- monthly
  who TEXT NOT NULL DEFAULT 'shared' CHECK (who IN ('lola','mark','shared')),
  essential INTEGER NOT NULL DEFAULT 1,        -- 0 = could be cut back
  replaced_by_move INTEGER NOT NULL DEFAULT 0, -- 1 = goes away when you move (current rent etc.)
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

const defaults = {
  wedding_date: "2028-09-01",
  wedding_label: "September 2028",
  ai_enabled: "0",
  // Rental affordability rules of thumb — editable on the Rentals screen
  rent_ratio_target: "0.30",   // all-in housing as a share of income
  savings_target: "0",         // dollars you want left over every month
};
const insertSetting = db.prepare(
  "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)"
);
for (const [k, v] of Object.entries(defaults)) insertSetting.run(k, v);

// Seed the wedding goal once
const goalCount = db.prepare("SELECT COUNT(*) AS n FROM goals").get().n;
if (goalCount === 0) {
  db.prepare(
    "INSERT INTO goals (title, detail) VALUES (?, ?)"
  ).run("The wedding — September 2028", "Our big one. Milestones live here.");
}

export function getSetting(key) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? row.value : null;
}

export function setSetting(key, value) {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, String(value));
}
