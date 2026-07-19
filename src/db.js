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
`);

const defaults = {
  wedding_date: "2028-09-01",
  wedding_label: "September 2028",
  ai_enabled: "0",
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
