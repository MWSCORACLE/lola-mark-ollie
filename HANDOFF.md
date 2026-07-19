# Lola + Mark + Ollie — Surface Go 2 Handoff

Paste this entire document into a new Claude Code session on the Surface Go 2. It contains everything needed to recreate the app exactly as built and verified on Mark's main PC on 2026-07-19.

## Instructions for the Claude session reading this

You are recreating a finished, tested app — do NOT redesign, refactor, or "improve" anything. Follow these steps:

1. **Check Node.js**: run `node --version`. If Node is missing or older than v20, tell the user to install Node.js LTS from https://nodejs.org (Windows 64-bit installer, default options), then continue.
2. **Create the project** at `C:\Users\<username>\lola-mark-ollie` (ask the user to confirm the username / preferred location).
3. **Write every file** from the "File contents" section below, verbatim, preserving the exact relative paths.
4. Run `npm install --no-audit --no-fund` in the project folder. The included `.npmrc` pins the public npm registry (Mark's other machine had a corporate mirror that hangs; harmless here).
5. Run `npm start` and verify http://localhost:3467 loads: the calendar should render with "Lola + Mark + Ollie" branding. Add a test event and write a "daily five" entry to confirm the database works (a `data/` folder with a .db file appears on first run).
6. Set up **autostart + kiosk mode** (section below).
7. Set up **Claude Desktop MCP** (section below) if Claude Desktop is installed on the tablet.

## What this app is

A local-first shared calendar + daily-connection app for Mark and his fiancée Lauren (shown in-app as "Lola"), plus their dog Ollie. Runs entirely on the tablet: Node.js + Express + SQLite (better-sqlite3), touch-first web UI served to Edge. No cloud, no accounts. Wedding target: September 2028 (the Us screen counts down to it).

Key decisions already settled — do not change:
- Light, airy palette; dark theme supported. Person colors: Lola = rose, Mark = sea-green, Ollie = gold, Together = violet.
- Calendar month view uses colored dots per person, not text labels. ♥ appears on days both partners wrote.
- NO lock/reveal mechanic — entries are visible immediately after saving.
- Daily five prompts: a thing you do that I love / how I'm feeling (mood chip + text) / something I'm excited for / a thought for you / shared-goal check-in. Plus an optional "Ollie report".
- Us screen: wedding countdown, writing streak, Sunday recap, goals.
- AI layer: recap generation is rule-based/local by default; a toggle enables Claude API recaps (needs ANTHROPIC_API_KEY). The MCP server (`mcp/mcp-server.js`) exposes the app's data to Claude Desktop.

## Autostart + kiosk mode (do this after the app works)

Create these two files in the project folder, then put a shortcut to `start-tablet.vbs` in the Startup folder (`Win+R` → `shell:startup`):

**start-tablet.cmd**
```cmd
@echo off
cd /d "%~dp0"
start /b "" node src\server.js
timeout /t 3 /nobreak >nul
start "" msedge --kiosk http://localhost:3467 --edge-kiosk-type=fullscreen --no-first-run
```

**start-tablet.vbs** (runs the .cmd with no visible console window)
```vbs
Set sh = CreateObject("WScript.Shell")
sh.Run """" & CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName) & "\start-tablet.cmd" & """", 0, False
```

Exit kiosk mode with Ctrl+Alt+Del or Alt+F4. To make the tablet feel like an appliance, also set Windows to auto-login and never sleep (Settings → System → Power).

## Claude Desktop MCP setup (the AI layer)

If Claude Desktop is installed on the tablet, edit `%APPDATA%\Claude\claude_desktop_config.json` (create it if missing) and merge in:

```json
{
  "mcpServers": {
    "lola-mark-ollie": {
      "command": "node",
      "args": ["C:\\Users\\<username>\\lola-mark-ollie\\mcp\\mcp-server.js"]
    }
  }
}
```

Replace `<username>` with the real path. Restart Claude Desktop; it will show the lola-mark-ollie tools (get_today_overview, list_events, add_event, delete_event, get_daily_entries, and more). Then you can ask Claude things like "add Ollie's vet appointment Friday at 3" or "what did Lauren write today?".

Optional AI recaps: set the environment variable `ANTHROPIC_API_KEY` before starting the server (or add `set ANTHROPIC_API_KEY=sk-ant-...` to start-tablet.cmd — note this stores the key in plain text on the tablet), then flip "Turn AI on" in the Us screen.

## Verification checklist (run through after setup)

- [ ] Calendar renders, month navigation works
- [ ] "+ Add event" creates an event; a colored dot appears on that day
- [ ] Profile switcher (L / M chips, top right) switches who is writing
- [ ] "Write yours" saves all five prompts + mood + Ollie report; day view shows them
- [ ] Us screen: wedding countdown to Sept 2028, streak, goals
- [ ] "Generate this week's recap" produces a recap from real data (local mode)
- [ ] `data/lola-mark-ollie.db` exists after first save (this file is the couple's entire history — back it up)
- [ ] MCP smoke test passes (Claude Desktop lists the tools)

---

# File contents

Every file below must be written verbatim to the given path (relative to the project root).


## File: `package.json`

````json
{
  "name": "lola-mark-ollie",
  "version": "0.1.0",
  "description": "Local-first shared calendar and daily-connection app for the kitchen tablet",
  "private": true,
  "type": "module",
  "main": "src/server.js",
  "scripts": {
    "start": "node src/server.js",
    "mcp": "node mcp/mcp-server.js"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.112.0",
    "@modelcontextprotocol/sdk": "^1.12.0",
    "better-sqlite3": "^12.2.0",
    "express": "^4.21.0",
    "zod": "^3.24.0"
  }
}

````


## File: `.npmrc`

````
registry=https://registry.npmjs.org/

````


## File: `src/db.js`

````js
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

````


## File: `src/server.js`

````js
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, getSetting, setSetting } from "./db.js";
import { generateRecap } from "./recap.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(path.join(here, "..", "public")));

const WHOS = ["lola", "mark", "ollie", "shared"];
const AUTHORS = ["lola", "mark"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function bad(res, msg) {
  return res.status(400).json({ error: msg });
}

// ---------- Calendar month state ----------
app.get("/api/month/:ym", (req, res) => {
  const ym = req.params.ym; // YYYY-MM
  if (!/^\d{4}-\d{2}$/.test(ym)) return bad(res, "month must be YYYY-MM");
  const from = `${ym}-01`;
  const to = `${ym}-31`;
  const events = db
    .prepare("SELECT * FROM events WHERE date BETWEEN ? AND ? ORDER BY date, time")
    .all(from, to);
  const entryDays = db
    .prepare(
      `SELECT date,
              SUM(CASE WHEN author='lola' THEN 1 ELSE 0 END) AS lola,
              SUM(CASE WHEN author='mark' THEN 1 ELSE 0 END) AS mark
       FROM entries WHERE date BETWEEN ? AND ? GROUP BY date`
    )
    .all(from, to);
  res.json({ events, entryDays });
});

// ---------- Day detail ----------
app.get("/api/day/:date", (req, res) => {
  const date = req.params.date;
  if (!DATE_RE.test(date)) return bad(res, "date must be YYYY-MM-DD");
  const events = db
    .prepare("SELECT * FROM events WHERE date = ? ORDER BY time")
    .all(date);
  const entries = db.prepare("SELECT * FROM entries WHERE date = ?").all(date);
  const ollie = db.prepare("SELECT * FROM ollie_reports WHERE date = ?").get(date);
  const goals = db.prepare("SELECT * FROM goals WHERE done = 0").all();
  res.json({ date, events, entries, ollie: ollie ?? null, goals });
});

// ---------- Events ----------
app.post("/api/events", (req, res) => {
  const { date, time, title, who, notes } = req.body ?? {};
  if (!DATE_RE.test(date ?? "")) return bad(res, "date must be YYYY-MM-DD");
  if (!title) return bad(res, "title required");
  if (!WHOS.includes(who)) return bad(res, "who must be lola|mark|ollie|shared");
  const info = db
    .prepare("INSERT INTO events (date, time, title, who, notes) VALUES (?, ?, ?, ?, ?)")
    .run(date, time || null, title, who, notes || null);
  res.json(db.prepare("SELECT * FROM events WHERE id = ?").get(info.lastInsertRowid));
});

app.delete("/api/events/:id", (req, res) => {
  db.prepare("DELETE FROM events WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

// ---------- Daily entries (the five) ----------
app.post("/api/entries", (req, res) => {
  const { date, author, love_note, mood, feeling_text, excited, thought, goal_checkin } =
    req.body ?? {};
  if (!DATE_RE.test(date ?? "")) return bad(res, "date must be YYYY-MM-DD");
  if (!AUTHORS.includes(author)) return bad(res, "author must be lola|mark");
  db.prepare(
    `INSERT INTO entries (date, author, love_note, mood, feeling_text, excited, thought, goal_checkin)
     VALUES (@date, @author, @love_note, @mood, @feeling_text, @excited, @thought, @goal_checkin)
     ON CONFLICT(date, author) DO UPDATE SET
       love_note=excluded.love_note, mood=excluded.mood, feeling_text=excluded.feeling_text,
       excited=excluded.excited, thought=excluded.thought, goal_checkin=excluded.goal_checkin,
       updated_at=datetime('now')`
  ).run({
    date,
    author,
    love_note: love_note ?? null,
    mood: mood ?? null,
    feeling_text: feeling_text ?? null,
    excited: excited ?? null,
    thought: thought ?? null,
    goal_checkin: goal_checkin ?? null,
  });
  res.json(
    db.prepare("SELECT * FROM entries WHERE date = ? AND author = ?").get(date, author)
  );
});

// ---------- Ollie report ----------
app.post("/api/ollie", (req, res) => {
  const { date, text, author } = req.body ?? {};
  if (!DATE_RE.test(date ?? "")) return bad(res, "date must be YYYY-MM-DD");
  if (!text) return bad(res, "text required");
  db.prepare(
    `INSERT INTO ollie_reports (date, text, author) VALUES (?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET text=excluded.text, author=excluded.author, updated_at=datetime('now')`
  ).run(date, text, author || null);
  res.json(db.prepare("SELECT * FROM ollie_reports WHERE date = ?").get(date));
});

// ---------- Goals ----------
app.get("/api/goals", (_req, res) => {
  res.json(db.prepare("SELECT * FROM goals ORDER BY done, id").all());
});

app.post("/api/goals", (req, res) => {
  const { title, detail, target_value, unit } = req.body ?? {};
  if (!title) return bad(res, "title required");
  const info = db
    .prepare("INSERT INTO goals (title, detail, target_value, unit) VALUES (?, ?, ?, ?)")
    .run(title, detail || null, target_value ?? null, unit || null);
  res.json(db.prepare("SELECT * FROM goals WHERE id = ?").get(info.lastInsertRowid));
});

app.patch("/api/goals/:id", (req, res) => {
  const goal = db.prepare("SELECT * FROM goals WHERE id = ?").get(req.params.id);
  if (!goal) return res.status(404).json({ error: "goal not found" });
  const { title, detail, target_value, current_value, unit, done } = req.body ?? {};
  db.prepare(
    `UPDATE goals SET
       title = COALESCE(?, title), detail = COALESCE(?, detail),
       target_value = COALESCE(?, target_value), current_value = COALESCE(?, current_value),
       unit = COALESCE(?, unit), done = COALESCE(?, done)
     WHERE id = ?`
  ).run(
    title ?? null,
    detail ?? null,
    target_value ?? null,
    current_value ?? null,
    unit ?? null,
    done === undefined ? null : done ? 1 : 0,
    req.params.id
  );
  res.json(db.prepare("SELECT * FROM goals WHERE id = ?").get(req.params.id));
});

// ---------- "Us" screen ----------
app.get("/api/us", (_req, res) => {
  const goals = db.prepare("SELECT * FROM goals ORDER BY done, id").all();

  // Writing streak: last 7 days where both wrote
  const days = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  const rows = db
    .prepare(
      `SELECT date, COUNT(DISTINCT author) AS n FROM entries
       WHERE date BETWEEN ? AND ? GROUP BY date`
    )
    .all(days[0], days[6]);
  const byDate = Object.fromEntries(rows.map((r) => [r.date, r.n]));
  const streak = days.map((d) => ({ date: d, both: (byDate[d] ?? 0) >= 2 }));

  // On this day: an entry from ~1 month ago
  const monthAgo = new Date(today);
  monthAgo.setMonth(today.getMonth() - 1);
  const onThisDay = db
    .prepare(
      `SELECT * FROM entries WHERE date <= ? AND love_note IS NOT NULL
       ORDER BY date DESC LIMIT 1`
    )
    .get(monthAgo.toISOString().slice(0, 10));

  const lastRecap = db
    .prepare("SELECT * FROM recaps ORDER BY week_end DESC LIMIT 1")
    .get();

  res.json({
    goals,
    streak,
    onThisDay: onThisDay ?? null,
    wedding: {
      date: getSetting("wedding_date"),
      label: getSetting("wedding_label"),
    },
    lastRecap: lastRecap ?? null,
    aiEnabled: getSetting("ai_enabled") === "1",
    aiKeyPresent: Boolean(process.env.ANTHROPIC_API_KEY),
  });
});

// ---------- Recap ----------
app.post("/api/recap", async (req, res) => {
  try {
    const { week_end } = req.body ?? {};
    let weekEnd = week_end;
    if (!weekEnd) {
      // most recent Sunday (today if Sunday)
      const d = new Date();
      d.setDate(d.getDate() - d.getDay());
      weekEnd = d.toISOString().slice(0, 10);
    }
    if (!DATE_RE.test(weekEnd)) return bad(res, "week_end must be YYYY-MM-DD");
    const recap = await generateRecap(weekEnd);
    res.json(recap);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ---------- Settings ----------
app.get("/api/settings", (_req, res) => {
  const rows = db.prepare("SELECT key, value FROM settings").all();
  res.json(Object.fromEntries(rows.map((r) => [r.key, r.value])));
});

app.post("/api/settings", (req, res) => {
  for (const [k, v] of Object.entries(req.body ?? {})) setSetting(k, v);
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3467;
app.listen(PORT, () => {
  console.log(`Lola + Mark + Ollie running at http://localhost:${PORT}`);
});

````


## File: `src/recap.js`

````js
import Anthropic from "@anthropic-ai/sdk";
import { db, getSetting } from "./db.js";

const NAMES = { lola: "Lola", mark: "Mark" };

export function weekRange(weekEnd) {
  // weekEnd is a Sunday (YYYY-MM-DD); week runs Monday..Sunday
  const end = new Date(weekEnd + "T00:00:00");
  const start = new Date(end);
  start.setDate(end.getDate() - 6);
  const iso = (d) => d.toISOString().slice(0, 10);
  return { from: iso(start), to: iso(end) };
}

export function collectWeekData(weekEnd) {
  const { from, to } = weekRange(weekEnd);
  const entries = db
    .prepare("SELECT * FROM entries WHERE date BETWEEN ? AND ? ORDER BY date")
    .all(from, to);
  const events = db
    .prepare("SELECT * FROM events WHERE date BETWEEN ? AND ? ORDER BY date, time")
    .all(from, to);
  const ollie = db
    .prepare("SELECT * FROM ollie_reports WHERE date BETWEEN ? AND ? ORDER BY date")
    .all(from, to);
  const goals = db.prepare("SELECT * FROM goals WHERE done = 0").all();
  return { from, to, entries, events, ollie, goals };
}

function localRecap(data) {
  const lines = [];
  lines.push(`Week of ${data.from} to ${data.to}`);
  const byAuthor = { lola: [], mark: [] };
  for (const e of data.entries) byAuthor[e.author]?.push(e);
  for (const who of ["lola", "mark"]) {
    const list = byAuthor[who];
    if (!list.length) continue;
    const moods = list.map((e) => e.mood).filter(Boolean);
    lines.push(
      `${NAMES[who]} wrote ${list.length} day${list.length === 1 ? "" : "s"}` +
        (moods.length ? ` — moods: ${moods.join(", ")}` : "")
    );
    const notes = list.map((e) => e.love_note).filter(Boolean);
    if (notes.length) lines.push(`  A note from ${NAMES[who]}: "${notes[notes.length - 1]}"`);
  }
  if (data.events.length) {
    lines.push(
      "Together this week: " +
        data.events.map((ev) => `${ev.title} (${ev.date})`).join(", ")
    );
  }
  if (data.ollie.length) {
    lines.push(`Ollie report highlights: ${data.ollie.map((o) => o.text).join(" | ")}`);
  }
  for (const g of data.goals) {
    if (g.target_value) {
      lines.push(`Goal — ${g.title}: ${g.current_value ?? 0} of ${g.target_value} ${g.unit ?? ""}`.trim());
    } else {
      lines.push(`Goal — ${g.title}`);
    }
  }
  return lines.join("\n");
}

async function claudeRecap(data) {
  const client = new Anthropic(); // resolves ANTHROPIC_API_KEY from the environment
  const response = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 16000,
    system:
      "You write a short, warm Sunday-night recap for a couple, Lola and Mark (and their dog Ollie), " +
      "based on the week's private journal entries they wrote for each other. Write 2-4 short paragraphs " +
      "in the second person plural ('you two'), tender but not saccharine. Mention moods gently, celebrate " +
      "goal progress, and end with one small suggestion for the week ahead drawn from something they wrote. " +
      "Never invent facts that are not in the data.",
    messages: [
      {
        role: "user",
        content:
          "Here is this week's data as JSON. Write the recap.\n\n" +
          JSON.stringify(data, null, 2),
      },
    ],
  });
  if (response.stop_reason === "refusal") {
    throw new Error("Claude declined to write the recap");
  }
  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  if (!text.trim()) throw new Error("Empty recap from Claude");
  return text;
}

export async function generateRecap(weekEnd) {
  const existing = db.prepare("SELECT * FROM recaps WHERE week_end = ?").get(weekEnd);
  if (existing) return existing;

  const data = collectWeekData(weekEnd);
  let body;
  let source = "local";
  const aiEnabled = getSetting("ai_enabled") === "1";
  if (aiEnabled && process.env.ANTHROPIC_API_KEY) {
    try {
      body = await claudeRecap(data);
      source = "claude";
    } catch (err) {
      console.error("Claude recap failed, falling back to local:", err.message);
      body = localRecap(data);
    }
  } else {
    body = localRecap(data);
  }
  db.prepare("INSERT INTO recaps (week_end, body, source) VALUES (?, ?, ?)").run(
    weekEnd,
    body,
    source
  );
  return db.prepare("SELECT * FROM recaps WHERE week_end = ?").get(weekEnd);
}

````


## File: `public/index.html`

````html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lola + Mark + Ollie</title>
<link rel="stylesheet" href="style.css">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icon.svg" type="image/svg+xml">
<meta name="theme-color" content="#8B79B8">
</head>
<body>
<div class="app">
  <div class="topbar">
    <span class="brand"><span class="n-lola">Lola</span> <span class="plus">+</span> <span class="n-mark">Mark</span> <span class="plus">+</span> <span class="n-ollie">Ollie</span></span>
    <span class="today-label" id="today-label"></span>
    <nav class="tabs">
      <button class="tab active" data-screen="cal">Calendar</button>
      <button class="tab" data-screen="day">Today</button>
      <button class="tab" data-screen="compose">Write yours</button>
      <button class="tab" data-screen="us">Us</button>
    </nav>
    <div class="who-toggle" title="Who's using the tablet?">
      <span class="label">I am:</span>
      <button class="avatar lola" id="who-lola">L</button>
      <button class="avatar mark" id="who-mark">M</button>
    </div>
  </div>

  <!-- Calendar -->
  <section class="screen active panel" id="screen-cal">
    <div class="cal-head">
      <button class="nav-btn" id="prev-month" aria-label="Previous month">‹</button>
      <h2 id="cal-title"></h2>
      <button class="nav-btn" id="next-month" aria-label="Next month">›</button>
      <div class="legend">
        <span><i class="dot lola"></i> Lola</span>
        <span><i class="dot mark"></i> Mark</span>
        <span><i class="dot ollie"></i> Ollie</span>
        <span><i class="dot shared"></i> Together</span>
        <span>♥ = both wrote</span>
      </div>
    </div>
    <div class="agenda" id="agenda"></div>
    <div class="cal-grid" id="cal-grid"></div>
  </section>

  <!-- Day view -->
  <section class="screen panel" id="screen-day">
    <button class="back" id="back-to-cal">← Back to calendar</button>
    <div class="day-head"><h2 id="day-title"></h2></div>
    <div class="day-events" id="day-events"></div>
    <div class="cols" id="day-cols"></div>
  </section>

  <!-- Compose -->
  <section class="screen panel compose" id="screen-compose">
    <button class="back" id="back-to-day">← Back to the day</button>
    <h2 id="compose-title"></h2>
    <p class="sub">Takes about two minutes. Saved the moment you tap the button.</p>
    <div class="field">
      <label id="lbl-love">A thing they do that you love</label>
      <textarea id="f-love" placeholder="Tap to write…"></textarea>
    </div>
    <div class="field">
      <label>How you're feeling today</label>
      <div class="moods" id="moods"></div>
      <textarea id="f-feeling" style="margin-top:8px" placeholder="A few words more, if you like…"></textarea>
    </div>
    <div class="field">
      <label>Something you're excited for</label>
      <textarea id="f-excited" placeholder="Tap to write…"></textarea>
    </div>
    <div class="field">
      <label id="lbl-thought">A thought that might interest them</label>
      <textarea id="f-thought" placeholder="Tap to write…"></textarea>
    </div>
    <div class="field">
      <label>Check in on a goal you share</label>
      <textarea id="f-goal" placeholder="Wedding, September 2028 — anything to add or celebrate?"></textarea>
    </div>
    <div class="field">
      <label>The Ollie report <span style="color:var(--muted);font-weight:400">(optional, one per day)</span></label>
      <textarea id="f-ollie" placeholder="Walks, snacks, crimes committed…"></textarea>
    </div>
    <button class="btn shared-btn" id="save-entry">Save today's five</button>
  </section>

  <!-- Us -->
  <section class="screen panel" id="screen-us">
    <div class="day-head" style="margin-bottom:16px;">
      <h2 class="serif" style="font-size:1.45rem; margin:0;">Us</h2>
      <span class="today-label">the running story of Lola, Mark &amp; Ollie</span>
    </div>
    <div class="cards3" id="us-cards"></div>
  </section>
</div>

<!-- Add event dialog -->
<dialog id="event-dialog">
  <h3>Add to the calendar</h3>
  <div class="field"><label>What is it?</label><input id="ev-title" placeholder="Dinner with the Halls"></div>
  <div class="row2">
    <div class="field"><label>Date</label><input id="ev-date" type="date"></div>
    <div class="field"><label>Time</label><input id="ev-time" type="time"></div>
  </div>
  <div class="field"><label>Whose is it?</label>
    <select id="ev-who">
      <option value="shared">Together</option>
      <option value="lola">Lola</option>
      <option value="mark">Mark</option>
      <option value="ollie">Ollie</option>
    </select>
  </div>
  <div class="dialog-actions">
    <button class="btn ghost" id="ev-cancel">Cancel</button>
    <button class="btn shared-btn" id="ev-save">Add event</button>
  </div>
</dialog>

<!-- Add goal dialog -->
<dialog id="goal-dialog">
  <h3>A goal to chase together</h3>
  <div class="field"><label>The goal</label><input id="g-title" placeholder="Hike 12 trails this year"></div>
  <div class="row2">
    <div class="field"><label>Target (number, optional)</label><input id="g-target" type="number" inputmode="decimal"></div>
    <div class="field"><label>Unit</label><input id="g-unit" placeholder="$, trails, books…"></div>
  </div>
  <div class="dialog-actions">
    <button class="btn ghost" id="g-cancel">Cancel</button>
    <button class="btn shared-btn" id="g-save">Add goal</button>
  </div>
</dialog>

<!-- Update goal dialog -->
<dialog id="progress-dialog">
  <h3 id="p-title">Update progress</h3>
  <div class="field"><label>Current value</label><input id="p-value" type="number" inputmode="decimal"></div>
  <div class="dialog-actions">
    <button class="btn ghost" id="p-cancel">Cancel</button>
    <button class="btn shared-btn" id="p-save">Save</button>
  </div>
</dialog>

<div class="toast" id="toast"></div>
<script src="app.js"></script>
</body>
</html>

````


## File: `public/style.css`

````css
:root {
  --bg: #FDFBF8;
  --surface: #FFFFFF;
  --surface-2: #F7F3EF;
  --ink: #3B3442;
  --muted: #8E8496;
  --line: #ECE5E0;
  --mark: #4E9C87;
  --mark-soft: #E4F2ED;
  --lola: #D6798F;
  --lola-soft: #FAE8EC;
  --ollie: #D99A4E;
  --ollie-soft: #F9EEDD;
  --shared: #8B79B8;
  --shared-soft: #EFEAF7;
  --shadow: 0 2px 14px rgba(59, 52, 66, 0.06);
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #232029;
    --surface: #2C2833;
    --surface-2: #353040;
    --ink: #F2EDF3;
    --muted: #A79DB0;
    --line: #3E3848;
    --mark: #6FC0AA;
    --mark-soft: #2A3A35;
    --lola: #E698AB;
    --lola-soft: #402B32;
    --ollie: #E5B071;
    --ollie-soft: #403528;
    --shared: #AC9BD6;
    --shared-soft: #363047;
    --shadow: 0 2px 14px rgba(0, 0, 0, 0.35);
  }
}

* { box-sizing: border-box; }
html, body { height: 100%; }
body {
  background: var(--bg);
  color: var(--ink);
  font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
  margin: 0;
  line-height: 1.5;
  -webkit-tap-highlight-color: transparent;
}
.serif { font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif; }
button { font: inherit; color: inherit; cursor: pointer; }

.app { max-width: 1180px; margin: 0 auto; padding: 12px 14px 40px; }

/* ---------- Top bar ---------- */
.topbar {
  display: flex; align-items: center; gap: 14px;
  padding: 10px 6px 14px; flex-wrap: wrap;
}
.brand {
  font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
  font-size: 1.35rem; white-space: nowrap;
}
.brand .n-lola { color: var(--lola); }
.brand .n-mark { color: var(--mark); }
.brand .n-ollie { color: var(--ollie); }
.brand .plus { color: var(--muted); font-size: 1rem; }
.today-label { color: var(--muted); font-size: 0.9rem; }
.tabs { display: flex; gap: 6px; margin-left: auto; flex-wrap: wrap; }
.tab {
  border: 1px solid var(--line); background: transparent; color: var(--muted);
  font-size: 0.95rem; padding: 10px 20px; border-radius: 999px; min-height: 46px;
}
.tab.active { background: var(--shared-soft); color: var(--shared); border-color: var(--shared); font-weight: 600; }
.tab:focus-visible, button:focus-visible { outline: 2px solid var(--shared); outline-offset: 2px; }

.who-toggle { display: flex; gap: 6px; align-items: center; }
.who-toggle .label { font-size: 0.75rem; color: var(--muted); }
.avatar {
  width: 44px; height: 44px; border-radius: 50%;
  display: grid; place-items: center; font-weight: 600; font-size: 0.95rem;
  border: 2px solid transparent; background: var(--surface-2); color: var(--muted);
}
.avatar.lola.sel { background: var(--lola-soft); color: var(--lola); border-color: var(--lola); }
.avatar.mark.sel { background: var(--mark-soft); color: var(--mark); border-color: var(--mark); }
.avatar.lola, .avatar.mark { transition: border-color .15s; }

/* ---------- Panels ---------- */
.panel {
  background: var(--surface); border: 1px solid var(--line);
  border-radius: 18px; box-shadow: var(--shadow); padding: 20px;
}
.screen { display: none; }
.screen.active { display: block; }

/* ---------- Calendar ---------- */
.cal-head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
.cal-head h2 {
  font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
  font-size: 1.45rem; margin: 0; min-width: 200px;
}
.nav-btn {
  border: 1px solid var(--line); background: var(--surface-2);
  border-radius: 12px; width: 46px; height: 46px; font-size: 1.1rem;
}
.legend { display: flex; gap: 14px; margin-left: auto; font-size: 0.8rem; color: var(--muted); flex-wrap: wrap; }
.legend span { display: inline-flex; align-items: center; gap: 6px; }
.dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
.dot.lola { background: var(--lola); }
.dot.mark { background: var(--mark); }
.dot.ollie { background: var(--ollie); }
.dot.shared { background: var(--shared); }

.agenda {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  background: var(--surface-2); border-radius: 12px;
  padding: 10px 14px; margin-bottom: 14px; font-size: 0.88rem; min-height: 46px;
}
.agenda .when { color: var(--muted); font-weight: 600; margin-right: 4px; }
.chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 5px 13px; border-radius: 999px; font-size: 0.85rem; font-weight: 600;
  border: none;
}
.chip.lola { background: var(--lola-soft); color: var(--lola); }
.chip.mark { background: var(--mark-soft); color: var(--mark); }
.chip.ollie { background: var(--ollie-soft); color: var(--ollie); }
.chip.shared { background: var(--shared-soft); color: var(--shared); }
.chip.ghost { background: transparent; border: 1px dashed var(--line); color: var(--muted); }

.cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; }
.dow {
  text-align: center; font-size: 0.72rem; text-transform: uppercase;
  letter-spacing: 0.08em; color: var(--muted); padding: 4px 0;
}
.day {
  background: var(--surface-2); border: 1px solid transparent; border-radius: 12px;
  min-height: 84px; padding: 9px 10px; text-align: left;
  display: flex; flex-direction: column; gap: 6px;
}
.day:hover { border-color: var(--shared); }
.day.blank { background: transparent; cursor: default; }
.day.blank:hover { border-color: transparent; }
.day .num { font-size: 0.9rem; font-weight: 600; }
.day.today { border: 2px solid var(--shared); background: var(--shared-soft); }
.day.today .num { color: var(--shared); }
.day .marks { display: flex; gap: 5px; align-items: center; flex-wrap: wrap; }
.day .wrote { margin-top: auto; font-size: 0.74rem; color: var(--lola); }

/* ---------- Day view ---------- */
.back { border: none; background: none; color: var(--shared); padding: 8px 8px 8px 0; font-size: 0.92rem; }
.day-head { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.day-head h2 {
  font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
  font-size: 1.45rem; margin: 0;
}
.day-events { display: flex; gap: 8px; flex-wrap: wrap; margin: 10px 0 18px; align-items: center; }

.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
@media (max-width: 800px) { .cols { grid-template-columns: 1fr; } }
.col-title {
  font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
  font-size: 1.05rem; margin: 0 0 10px; display: flex; align-items: center; gap: 8px;
}
.col-title .dot { width: 11px; height: 11px; }
.prompt-card { background: var(--surface-2); border-radius: 12px; padding: 12px 14px; margin-bottom: 10px; }
.prompt-card .label {
  font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.09em;
  color: var(--muted); margin-bottom: 4px;
}
.prompt-card .answer {
  font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
  font-size: 0.98rem; white-space: pre-wrap;
}
.empty-side {
  border: 1px dashed var(--line); border-radius: 12px; padding: 26px 18px;
  text-align: center; color: var(--muted);
}
.goal-card { grid-column: 1 / -1; background: var(--shared-soft); border-radius: 12px; padding: 14px 16px; }
.goal-card .label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.09em; color: var(--shared); margin-bottom: 4px; }
.ollie-card { grid-column: 1 / -1; background: var(--ollie-soft); border-radius: 12px; padding: 14px 16px; }
.ollie-card .label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.09em; color: var(--ollie); margin-bottom: 4px; }
.goal-card .answer, .ollie-card .answer {
  font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
  white-space: pre-wrap;
}

.btn {
  display: inline-block; border: none; background: var(--mark); color: #fff;
  font-size: 0.95rem; font-weight: 600; padding: 12px 24px; border-radius: 999px; min-height: 48px;
}
.btn.shared-btn { background: var(--shared); }
.btn.lola-btn { background: var(--lola); }
.btn.small { padding: 8px 16px; min-height: 40px; font-size: 0.85rem; }
.btn.ghost { background: transparent; color: var(--shared); border: 1px solid var(--shared); }

/* ---------- Compose ---------- */
.compose h2 {
  font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
  font-size: 1.35rem; margin: 0 0 2px;
}
.compose .sub { color: var(--muted); font-size: 0.9rem; margin: 0 0 18px; }
.field { margin-bottom: 16px; max-width: 680px; }
.field label {
  display: block; font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
  font-size: 1rem; margin-bottom: 6px;
}
.field textarea, .field input, .field select {
  width: 100%; border: 1px solid var(--line); border-radius: 10px;
  background: var(--surface-2); color: var(--ink); font: inherit; font-size: 0.98rem;
  padding: 11px 13px;
}
.field textarea { min-height: 68px; resize: vertical; }
.moods { display: flex; gap: 8px; flex-wrap: wrap; }
.mood-opt {
  border: 1px solid var(--line); background: var(--surface-2);
  font-size: 0.9rem; padding: 10px 18px; border-radius: 999px; min-height: 46px;
}
.mood-opt.sel { background: var(--mark); border-color: var(--mark); color: #fff; }
.mood-opt.sel.lola-sel { background: var(--lola); border-color: var(--lola); }

/* ---------- Us ---------- */
.cards3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
.xcard { background: var(--surface-2); border-radius: 14px; padding: 16px 18px; }
.xcard h3 {
  font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
  font-size: 1.05rem; margin: 0 0 8px;
}
.xcard p { font-size: 0.88rem; color: var(--muted); margin: 0 0 10px; }
.bar { height: 8px; border-radius: 999px; background: var(--line); overflow: hidden; }
.bar i { display: block; height: 100%; border-radius: 999px; background: var(--shared); }
.big-count { font-size: 2rem; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--shared); line-height: 1.15; }
.streak-row { display: flex; gap: 5px; margin-top: 6px; }
.streak-day { width: 24px; height: 24px; border-radius: 6px; background: var(--line); }
.streak-day.hit { background: var(--lola); }
.recap-body {
  font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
  color: var(--ink); font-size: 0.95rem; white-space: pre-wrap;
}

/* ---------- Dialog ---------- */
dialog {
  border: 1px solid var(--line); border-radius: 16px; background: var(--surface);
  color: var(--ink); box-shadow: var(--shadow); padding: 22px; max-width: 460px; width: 92vw;
}
dialog::backdrop { background: rgba(30, 25, 40, 0.45); }
dialog h3 { font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif; margin: 0 0 14px; }
.dialog-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 8px; }
.row2 { display: flex; gap: 10px; }
.row2 .field { flex: 1; }

.toast {
  position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
  background: var(--ink); color: var(--bg); padding: 12px 24px; border-radius: 999px;
  font-size: 0.9rem; opacity: 0; pointer-events: none; transition: opacity .25s;
}
.toast.show { opacity: 1; }
@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; }
}

````


## File: `public/app.js`

````js
"use strict";

const NAMES = { lola: "Lola", mark: "Mark", ollie: "Ollie", shared: "Together" };
const MOODS = ["Steady", "Happy", "Cozy", "Excited", "Stretched thin", "Anxious", "Tired"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DOWS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

let whoami = localStorage.getItem("whoami") || "mark";
let viewMonth = new Date(); // month being shown on the calendar
let selectedDate = isoToday();

function isoToday() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function pad(n) { return String(n).padStart(2, "0"); }
function partnerOf(who) { return who === "mark" ? "lola" : "mark"; }
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function prettyDate(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}
async function api(path, opts) {
  const res = await fetch(path, opts);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json();
}
function post(path, body) {
  return api(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2200);
}

// ---------- Navigation ----------
function show(screen) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  document.getElementById("screen-" + screen).classList.add("active");
  document.querySelectorAll(".tab").forEach((t) =>
    t.classList.toggle("active", t.dataset.screen === screen));
  window.scrollTo({ top: 0 });
  if (screen === "cal") renderCalendar();
  if (screen === "day") renderDay();
  if (screen === "compose") renderCompose();
  if (screen === "us") renderUs();
}

document.querySelectorAll(".tab").forEach((t) =>
  t.addEventListener("click", () => {
    if (t.dataset.screen === "day" || t.dataset.screen === "compose") selectedDate = isoToday();
    show(t.dataset.screen);
  }));
document.getElementById("back-to-cal").addEventListener("click", () => show("cal"));
document.getElementById("back-to-day").addEventListener("click", () => show("day"));

// ---------- Who am I ----------
function renderWho() {
  document.getElementById("who-lola").classList.toggle("sel", whoami === "lola");
  document.getElementById("who-mark").classList.toggle("sel", whoami === "mark");
}
for (const who of ["lola", "mark"]) {
  document.getElementById("who-" + who).addEventListener("click", () => {
    whoami = who;
    localStorage.setItem("whoami", who);
    renderWho();
    const active = document.querySelector(".screen.active").id.replace("screen-", "");
    if (active === "compose") renderCompose();
    if (active === "day") renderDay();
    toast(`Hi, ${NAMES[who]}`);
  });
}

// ---------- Calendar ----------
document.getElementById("prev-month").addEventListener("click", () => {
  viewMonth.setMonth(viewMonth.getMonth() - 1);
  renderCalendar();
});
document.getElementById("next-month").addEventListener("click", () => {
  viewMonth.setMonth(viewMonth.getMonth() + 1);
  renderCalendar();
});

async function renderCalendar() {
  const y = viewMonth.getFullYear();
  const m = viewMonth.getMonth();
  const ym = `${y}-${pad(m + 1)}`;
  document.getElementById("cal-title").textContent = `${MONTHS[m]} ${y}`;

  const { events, entryDays } = await api(`/api/month/${ym}`);
  const eventsByDate = {};
  for (const ev of events) (eventsByDate[ev.date] ??= []).push(ev);
  const entriesByDate = Object.fromEntries(entryDays.map((r) => [r.date, r]));

  // Today's agenda strip
  const today = isoToday();
  const agenda = document.getElementById("agenda");
  const todayEvents = eventsByDate[today] ?? [];
  const partner = partnerOf(whoami);
  const partnerWrote = (entriesByDate[today]?.[partner] ?? 0) > 0;
  agenda.innerHTML =
    `<span class="when">Today</span>` +
    todayEvents.map((ev) =>
      `<span class="chip ${ev.who}">${esc(ev.title)}${ev.time ? " · " + esc(ev.time) : ""}</span>`
    ).join("") +
    (partnerWrote ? `<span class="chip lola">♥ ${NAMES[partner]} wrote to you</span>` : "") +
    `<button class="chip ghost" id="add-event-btn">+ Add event</button>`;
  document.getElementById("add-event-btn").addEventListener("click", () => openEventDialog(today));

  // Grid
  const grid = document.getElementById("cal-grid");
  grid.innerHTML = DOWS.map((d) => `<div class="dow">${d}</div>`).join("");
  const first = new Date(y, m, 1);
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  for (let i = 0; i < first.getDay(); i++) grid.insertAdjacentHTML("beforeend", `<div class="day blank"></div>`);
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${ym}-${pad(d)}`;
    const evs = eventsByDate[iso] ?? [];
    const ent = entriesByDate[iso];
    const both = ent && ent.lola > 0 && ent.mark > 0;
    const dots = [...new Set(evs.map((e) => e.who))]
      .map((w) => `<i class="dot ${w}"></i>`).join("");
    const btn = document.createElement("button");
    btn.className = "day" + (iso === today ? " today" : "");
    btn.innerHTML =
      `<span class="num">${d}</span>` +
      (dots ? `<span class="marks">${dots}</span>` : "") +
      (both ? `<span class="wrote">♥</span>` : "");
    btn.addEventListener("click", () => { selectedDate = iso; show("day"); });
    grid.appendChild(btn);
  }
}

// ---------- Day view ----------
async function renderDay() {
  const data = await api(`/api/day/${selectedDate}`);
  document.getElementById("day-title").textContent = prettyDate(selectedDate);

  const evWrap = document.getElementById("day-events");
  evWrap.innerHTML =
    data.events.map((ev) =>
      `<span class="chip ${ev.who}">${esc(ev.title)}${ev.time ? " · " + esc(ev.time) : ""} · ${NAMES[ev.who]}</span>`
    ).join("") +
    `<button class="chip ghost" id="day-add-event">+ Add event</button>`;
  document.getElementById("day-add-event").addEventListener("click", () => openEventDialog(selectedDate));

  const byAuthor = {};
  for (const e of data.entries) byAuthor[e.author] = e;
  const partner = partnerOf(whoami);

  const side = (author) => {
    const e = byAuthor[author];
    const forWhom = NAMES[partnerOf(author)];
    const title =
      `<h3 class="col-title"><i class="dot ${author}"></i> From ${NAMES[author]}, for ${forWhom}</h3>`;
    if (!e) {
      const mine = author === whoami;
      return `<div>${title}<div class="empty-side">
        <span class="serif" style="display:block;color:var(--ink);margin-bottom:6px;">Nothing here yet.</span>
        ${mine
          ? `<button class="btn" id="write-now">Write today's five</button>`
          : `${NAMES[author]} hasn't written for this day.`}
      </div></div>`;
    }
    const card = (label, val) =>
      val ? `<div class="prompt-card"><div class="label">${label}</div><div class="answer">${esc(val)}</div></div>` : "";
    const mood = e.mood
      ? `<div class="prompt-card"><div class="label">How I'm feeling today</div>
         <div class="answer"><span class="chip ${author}" style="font-family:'Segoe UI',system-ui,sans-serif;">${esc(e.mood)}</span> ${esc(e.feeling_text ?? "")}</div></div>`
      : card("How I'm feeling today", e.feeling_text);
    return `<div>${title}
      ${card("A thing you do that I love", e.love_note)}
      ${mood}
      ${card("Something I'm excited for", e.excited)}
      ${card("A thought that might interest you", e.thought)}
    </div>`;
  };

  const goalChecks = data.entries.map((e) => e.goal_checkin).filter(Boolean);
  const goalTitle = data.goals[0]?.title ?? "Add a goal on the Us screen";
  const goalCard = `<div class="goal-card">
    <div class="label">A goal we're chasing together</div>
    <div class="answer">${esc(goalTitle)}${goalChecks.length ? " — " + goalChecks.map(esc).join(" ♥ ") : ""}</div>
  </div>`;

  const ollieCard = data.ollie
    ? `<div class="ollie-card"><div class="label">The Ollie report</div><div class="answer">${esc(data.ollie.text)}</div></div>`
    : "";

  document.getElementById("day-cols").innerHTML =
    side(partner) + side(whoami) + goalCard + ollieCard;

  const writeNow = document.getElementById("write-now");
  if (writeNow) writeNow.addEventListener("click", () => show("compose"));
}

// ---------- Compose ----------
let selectedMood = null;

async function renderCompose() {
  const partner = NAMES[partnerOf(whoami)];
  document.getElementById("compose-title").textContent =
    `${prettyDate(selectedDate)} — your five, for ${partner}`;
  document.getElementById("lbl-love").textContent = `A thing ${partner} does that you love`;
  document.getElementById("lbl-thought").textContent = `A thought that might interest ${partner}`;

  const data = await api(`/api/day/${selectedDate}`);
  const mine = data.entries.find((e) => e.author === whoami);
  document.getElementById("f-love").value = mine?.love_note ?? "";
  document.getElementById("f-feeling").value = mine?.feeling_text ?? "";
  document.getElementById("f-excited").value = mine?.excited ?? "";
  document.getElementById("f-thought").value = mine?.thought ?? "";
  document.getElementById("f-goal").value = mine?.goal_checkin ?? "";
  document.getElementById("f-ollie").value = data.ollie?.text ?? "";
  selectedMood = mine?.mood ?? null;

  const moodsWrap = document.getElementById("moods");
  moodsWrap.innerHTML = "";
  for (const m of MOODS) {
    const b = document.createElement("button");
    b.className = "mood-opt" + (m === selectedMood ? ` sel${whoami === "lola" ? " lola-sel" : ""}` : "");
    b.textContent = m;
    b.addEventListener("click", () => {
      selectedMood = selectedMood === m ? null : m;
      renderMoodSelection();
    });
    moodsWrap.appendChild(b);
  }
}
function renderMoodSelection() {
  document.querySelectorAll(".mood-opt").forEach((b) => {
    const on = b.textContent === selectedMood;
    b.classList.toggle("sel", on);
    b.classList.toggle("lola-sel", on && whoami === "lola");
  });
}

document.getElementById("save-entry").addEventListener("click", async () => {
  try {
    await post("/api/entries", {
      date: selectedDate,
      author: whoami,
      love_note: document.getElementById("f-love").value.trim() || null,
      mood: selectedMood,
      feeling_text: document.getElementById("f-feeling").value.trim() || null,
      excited: document.getElementById("f-excited").value.trim() || null,
      thought: document.getElementById("f-thought").value.trim() || null,
      goal_checkin: document.getElementById("f-goal").value.trim() || null,
    });
    const ollieText = document.getElementById("f-ollie").value.trim();
    if (ollieText) await post("/api/ollie", { date: selectedDate, text: ollieText, author: whoami });
    toast(`Saved — ${NAMES[partnerOf(whoami)]} can read it now ♥`);
    show("day");
  } catch (err) {
    toast(err.message);
  }
});

// ---------- Us ----------
async function renderUs() {
  const us = await api("/api/us");
  const wrap = document.getElementById("us-cards");

  const wedding = us.wedding.date ? new Date(us.wedding.date + "T00:00:00") : null;
  const daysOut = wedding ? Math.max(0, Math.ceil((wedding - new Date()) / 86400000)) : null;

  const goalCards = us.goals.map((g) => {
    const pct = g.target_value ? Math.min(100, Math.round(((g.current_value ?? 0) / g.target_value) * 100)) : null;
    return `<div class="xcard">
      <h3>${g.done ? "✓ " : ""}${esc(g.title)}</h3>
      <p>${g.target_value
        ? `${g.current_value ?? 0} of ${g.target_value} ${esc(g.unit ?? "")}`
        : esc(g.detail ?? "")}</p>
      ${pct !== null ? `<div class="bar"><i style="width:${pct}%"></i></div>` : ""}
      ${!g.done && g.target_value
        ? `<button class="btn small ghost" style="margin-top:10px" data-progress="${g.id}" data-title="${esc(g.title)}" data-value="${g.current_value ?? 0}">Update progress</button>`
        : ""}
    </div>`;
  }).join("");

  const streakHits = us.streak.filter((s) => s.both).length;
  const streakCard = `<div class="xcard">
    <h3>Writing streak</h3>
    <p>You've both written ${streakHits} of the last 7 days</p>
    <div class="streak-row">${us.streak.map((s) => `<span class="streak-day${s.both ? " hit" : ""}" title="${s.date}"></span>`).join("")}</div>
  </div>`;

  const weddingCard = `<div class="xcard">
    <h3>Wedding countdown</h3>
    <div class="big-count">${daysOut !== null ? daysOut + " days" : "—"}</div>
    <p>${esc(us.wedding.label ?? "")}</p>
  </div>`;

  const otdCard = us.onThisDay
    ? `<div class="xcard"><h3>From the archive</h3>
       <p class="serif" style="color:var(--ink);font-size:0.95rem;">${esc(us.onThisDay.date)} — “${esc(us.onThisDay.love_note)}”</p>
       <p>Written by ${NAMES[us.onThisDay.author]}</p></div>`
    : "";

  const aiNote = us.aiEnabled
    ? (us.aiKeyPresent ? "Claude writes the recap." : "AI is on, but no API key was found — using the local recap.")
    : "AI is off — recaps are assembled locally. Toggle below.";
  const recapCard = `<div class="xcard">
    <h3>Sunday recap</h3>
    ${us.lastRecap
      ? `<p>Week ending ${esc(us.lastRecap.week_end)} · ${us.lastRecap.source === "claude" ? "written by Claude" : "assembled locally"}</p>
         <div class="recap-body">${esc(us.lastRecap.body)}</div>`
      : `<p>No recap yet. Generate one for the current week.</p>`}
    <p style="margin-top:10px">${aiNote}</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">
      <button class="btn small shared-btn" id="gen-recap">Generate this week's recap</button>
      <button class="btn small ghost" id="toggle-ai">${us.aiEnabled ? "Turn AI off" : "Turn AI on"}</button>
    </div>
  </div>`;

  const newGoalCard = `<div class="xcard">
    <h3>New goal</h3>
    <p>Add something you want to chase together — a trip, a habit, a number.</p>
    <button class="btn small shared-btn" id="add-goal-btn">+ Add a goal</button>
  </div>`;

  wrap.innerHTML = weddingCard + goalCards + streakCard + otdCard + recapCard + newGoalCard;

  document.getElementById("add-goal-btn").addEventListener("click", openGoalDialog);
  document.getElementById("gen-recap").addEventListener("click", async (e) => {
    e.target.disabled = true;
    e.target.textContent = "Writing…";
    try {
      await post("/api/recap", {});
      renderUs();
    } catch (err) {
      toast(err.message);
      e.target.disabled = false;
      e.target.textContent = "Generate this week's recap";
    }
  });
  document.getElementById("toggle-ai").addEventListener("click", async () => {
    await post("/api/settings", { ai_enabled: us.aiEnabled ? "0" : "1" });
    renderUs();
  });
  wrap.querySelectorAll("[data-progress]").forEach((b) =>
    b.addEventListener("click", () => openProgressDialog(b.dataset.progress, b.dataset.title, b.dataset.value)));
}

// ---------- Dialogs ----------
const eventDialog = document.getElementById("event-dialog");
function openEventDialog(date) {
  document.getElementById("ev-date").value = date;
  document.getElementById("ev-title").value = "";
  document.getElementById("ev-time").value = "";
  document.getElementById("ev-who").value = "shared";
  eventDialog.showModal();
}
document.getElementById("ev-cancel").addEventListener("click", () => eventDialog.close());
document.getElementById("ev-save").addEventListener("click", async () => {
  try {
    await post("/api/events", {
      date: document.getElementById("ev-date").value,
      time: document.getElementById("ev-time").value || null,
      title: document.getElementById("ev-title").value.trim(),
      who: document.getElementById("ev-who").value,
    });
    eventDialog.close();
    toast("Added to the calendar");
    const active = document.querySelector(".screen.active").id.replace("screen-", "");
    if (active === "cal") renderCalendar();
    if (active === "day") renderDay();
  } catch (err) {
    toast(err.message);
  }
});

const goalDialog = document.getElementById("goal-dialog");
function openGoalDialog() {
  document.getElementById("g-title").value = "";
  document.getElementById("g-target").value = "";
  document.getElementById("g-unit").value = "";
  goalDialog.showModal();
}
document.getElementById("g-cancel").addEventListener("click", () => goalDialog.close());
document.getElementById("g-save").addEventListener("click", async () => {
  try {
    const target = document.getElementById("g-target").value;
    await post("/api/goals", {
      title: document.getElementById("g-title").value.trim(),
      target_value: target ? Number(target) : null,
      unit: document.getElementById("g-unit").value.trim() || null,
    });
    goalDialog.close();
    renderUs();
  } catch (err) {
    toast(err.message);
  }
});

const progressDialog = document.getElementById("progress-dialog");
let progressGoalId = null;
function openProgressDialog(id, title, value) {
  progressGoalId = id;
  document.getElementById("p-title").textContent = title;
  document.getElementById("p-value").value = value;
  progressDialog.showModal();
}
document.getElementById("p-cancel").addEventListener("click", () => progressDialog.close());
document.getElementById("p-save").addEventListener("click", async () => {
  try {
    await api(`/api/goals/${progressGoalId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_value: Number(document.getElementById("p-value").value) }),
    });
    progressDialog.close();
    renderUs();
  } catch (err) {
    toast(err.message);
  }
});

// ---------- Init ----------
document.getElementById("today-label").textContent =
  new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
renderWho();
renderCalendar();

````


## File: `public/manifest.webmanifest`

````json
{
  "name": "Lola + Mark + Ollie",
  "short_name": "L+M+O",
  "description": "Our shared calendar and daily connection ritual",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#FDFBF8",
  "theme_color": "#8B79B8",
  "icons": [
    { "src": "icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any" }
  ]
}

````


## File: `public/icon.svg`

````xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="22" fill="#8B79B8"/>
  <path d="M50 74 C38 64 26 55 26 43 a12 12 0 0 1 24-1 a12 12 0 0 1 24 1 C74 55 62 64 50 74 Z" fill="#FDFBF8"/>
  <circle cx="50" cy="30" r="5" fill="#D99A4E"/>
</svg>

````


## File: `mcp/mcp-server.js`

````js
// MCP server for "Lola + Mark + Ollie" — lets Claude Desktop on the tablet
// read and write the household calendar, daily entries, goals, and Ollie reports.
// Runs over stdio; reads the same SQLite database as the web app.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { db } from "../src/db.js";
import { collectWeekData } from "../src/recap.js";

const server = new McpServer({ name: "lola-mark-ollie", version: "0.1.0" });

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const WHO = z.enum(["lola", "mark", "ollie", "shared"]);
const AUTHOR = z.enum(["lola", "mark"]);

const json = (data) => ({ content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });
const todayIso = () => new Date().toISOString().slice(0, 10);

server.tool(
  "get_today_overview",
  "Today's events, daily entries from both partners, the Ollie report, and open shared goals.",
  {},
  async () => {
    const date = todayIso();
    return json({
      date,
      events: db.prepare("SELECT * FROM events WHERE date = ? ORDER BY time").all(date),
      entries: db.prepare("SELECT * FROM entries WHERE date = ?").all(date),
      ollie_report: db.prepare("SELECT * FROM ollie_reports WHERE date = ?").get(date) ?? null,
      open_goals: db.prepare("SELECT * FROM goals WHERE done = 0").all(),
    });
  }
);

server.tool(
  "list_events",
  "List calendar events in a date range (inclusive). Dates are YYYY-MM-DD.",
  { from: DATE, to: DATE },
  async ({ from, to }) =>
    json(db.prepare("SELECT * FROM events WHERE date BETWEEN ? AND ? ORDER BY date, time").all(from, to))
);

server.tool(
  "add_event",
  "Add a calendar event. 'who' is lola, mark, ollie, or shared (together).",
  {
    date: DATE,
    title: z.string().min(1),
    who: WHO,
    time: z.string().regex(/^\d{2}:\d{2}$/).optional().describe("24h HH:MM"),
    notes: z.string().optional(),
  },
  async ({ date, title, who, time, notes }) => {
    const info = db
      .prepare("INSERT INTO events (date, time, title, who, notes) VALUES (?, ?, ?, ?, ?)")
      .run(date, time ?? null, title, who, notes ?? null);
    return json(db.prepare("SELECT * FROM events WHERE id = ?").get(info.lastInsertRowid));
  }
);

server.tool(
  "delete_event",
  "Delete a calendar event by its id (find the id via list_events first).",
  { id: z.number().int() },
  async ({ id }) => {
    const info = db.prepare("DELETE FROM events WHERE id = ?").run(id);
    return json({ deleted: info.changes > 0 });
  }
);

server.tool(
  "get_daily_entries",
  "Get both partners' daily-five entries and the Ollie report for a date.",
  { date: DATE },
  async ({ date }) =>
    json({
      entries: db.prepare("SELECT * FROM entries WHERE date = ?").all(date),
      ollie_report: db.prepare("SELECT * FROM ollie_reports WHERE date = ?").get(date) ?? null,
    })
);

server.tool(
  "write_daily_entry",
  "Write or update one partner's daily-five entry for a date. Only pass fields being set; " +
    "existing values for omitted fields are preserved. Use this only when the author asks you " +
    "to record something on their behalf.",
  {
    date: DATE,
    author: AUTHOR,
    love_note: z.string().optional(),
    mood: z.string().optional(),
    feeling_text: z.string().optional(),
    excited: z.string().optional(),
    thought: z.string().optional(),
    goal_checkin: z.string().optional(),
  },
  async ({ date, author, ...fields }) => {
    const existing =
      db.prepare("SELECT * FROM entries WHERE date = ? AND author = ?").get(date, author) ?? {};
    const merged = {
      date,
      author,
      love_note: fields.love_note ?? existing.love_note ?? null,
      mood: fields.mood ?? existing.mood ?? null,
      feeling_text: fields.feeling_text ?? existing.feeling_text ?? null,
      excited: fields.excited ?? existing.excited ?? null,
      thought: fields.thought ?? existing.thought ?? null,
      goal_checkin: fields.goal_checkin ?? existing.goal_checkin ?? null,
    };
    db.prepare(
      `INSERT INTO entries (date, author, love_note, mood, feeling_text, excited, thought, goal_checkin)
       VALUES (@date, @author, @love_note, @mood, @feeling_text, @excited, @thought, @goal_checkin)
       ON CONFLICT(date, author) DO UPDATE SET
         love_note=excluded.love_note, mood=excluded.mood, feeling_text=excluded.feeling_text,
         excited=excluded.excited, thought=excluded.thought, goal_checkin=excluded.goal_checkin,
         updated_at=datetime('now')`
    ).run(merged);
    return json(db.prepare("SELECT * FROM entries WHERE date = ? AND author = ?").get(date, author));
  }
);

server.tool(
  "add_ollie_report",
  "Write or replace the Ollie report for a date (one per day).",
  { date: DATE, text: z.string().min(1), author: AUTHOR.optional() },
  async ({ date, text, author }) => {
    db.prepare(
      `INSERT INTO ollie_reports (date, text, author) VALUES (?, ?, ?)
       ON CONFLICT(date) DO UPDATE SET text=excluded.text, author=excluded.author, updated_at=datetime('now')`
    ).run(date, text, author ?? null);
    return json(db.prepare("SELECT * FROM ollie_reports WHERE date = ?").get(date));
  }
);

server.tool(
  "get_goals",
  "List shared goals, including progress and done state.",
  {},
  async () => json(db.prepare("SELECT * FROM goals ORDER BY done, id").all())
);

server.tool(
  "update_goal",
  "Update a shared goal's progress or mark it done.",
  {
    id: z.number().int(),
    current_value: z.number().optional(),
    done: z.boolean().optional(),
    detail: z.string().optional(),
  },
  async ({ id, current_value, done, detail }) => {
    const goal = db.prepare("SELECT * FROM goals WHERE id = ?").get(id);
    if (!goal) return json({ error: "goal not found" });
    db.prepare(
      "UPDATE goals SET current_value = COALESCE(?, current_value), done = COALESCE(?, done), detail = COALESCE(?, detail) WHERE id = ?"
    ).run(current_value ?? null, done === undefined ? null : done ? 1 : 0, detail ?? null, id);
    return json(db.prepare("SELECT * FROM goals WHERE id = ?").get(id));
  }
);

server.tool(
  "get_week_summary",
  "Raw data for a week (entries, events, Ollie reports, goals). week_end is the Sunday; defaults to the most recent Sunday.",
  { week_end: DATE.optional() },
  async ({ week_end }) => {
    let end = week_end;
    if (!end) {
      const d = new Date();
      d.setDate(d.getDate() - d.getDay());
      end = d.toISOString().slice(0, 10);
    }
    return json(collectWeekData(end));
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);

````


## File: `README.md`

````markdown
# Lola + Mark + Ollie

A local-first shared calendar and daily-connection app for the kitchen tablet
(Microsoft Surface Go 2). Everything — database, logic, UI — runs on the tablet.
No cloud account required; the AI layer is optional and toggleable.

## What it does

- **Calendar** — month view with color-coded dots (Lola rose, Mark green, Ollie gold,
  Together violet) and a ♥ on days you both wrote.
- **Daily five** — each of you writes five things for the other every day:
  a thing they do you love, how you're feeling (mood + words), something you're
  excited for, a thought for them, and a shared-goal check-in. Plus the optional
  **Ollie report**.
- **Us screen** — wedding countdown (September 2028), shared goals with progress,
  writing streak, "from the archive" memories, and a Sunday recap.
- **AI layer** —
  1. An **MCP server** so Claude Desktop on the tablet can read/write the calendar,
     entries, and goals conversationally ("add Ollie's grooming Friday at 2").
  2. An optional **Claude-written Sunday recap** (needs an Anthropic API key;
     falls back to a locally assembled recap otherwise).

## Run it

```powershell
cd "C:\Users\Mark Wilson\Desktop\Projects\lola-mark-ollie"
npm install
npm start
```

Then open http://localhost:3467. Data lives in `data\lola-mark-ollie.db`
(SQLite). Back that one file up and you've backed up everything.

## Set up on the Surface Go 2

1. **Install Node.js** (LTS) on the tablet, copy this folder over, run `npm install`.
2. **Start at boot** — Task Scheduler → Create Task →
   - Trigger: *At log on*
   - Action: Program `node`, arguments `src\server.js`,
     start in `C:\...\lola-mark-ollie`
3. **Kiosk-style fullscreen** — create a shortcut with target:
   ```
   msedge --app=http://localhost:3467
   ```
   and put it in `shell:startup`, or pin it to the taskbar. `--app` mode hides
   the browser chrome so it feels like a native app.
4. **Tap your initial** (L / M) in the top-right so entries are saved as you.

## Phones (later)

The server already serves the app to any device on your home Wi-Fi:
`http://<tablet-ip>:3467`. On iPhone, open it in Safari → Share →
*Add to Home Screen* and it installs like an app. For access away from home,
put both phones and the tablet on a [Tailscale](https://tailscale.com) network —
no port forwarding needed.

## Connect Claude Desktop (the AI layer)

Add this to Claude Desktop's config file
(`%APPDATA%\Claude\claude_desktop_config.json` on Windows):

```json
{
  "mcpServers": {
    "lola-mark-ollie": {
      "command": "node",
      "args": ["C:\\Users\\Mark Wilson\\Desktop\\Projects\\lola-mark-ollie\\mcp\\mcp-server.js"]
    }
  }
}
```

Restart Claude Desktop. You can then ask Claude things like:

- "What's on our calendar this week?"
- "Add a vet appointment for Ollie next Thursday at 4."
- "How has Lauren been feeling this week?"
- "Update the honeymoon fund to 3,100."

**Privacy note:** anything Claude reads through these tools is sent to Anthropic
for processing. The app itself never sends data anywhere.

## Claude-written Sunday recap (optional)

1. Get an Anthropic API key (https://platform.claude.com) and set it for the
   process that runs the server, e.g. in the scheduled task's environment or:
   ```powershell
   [Environment]::SetEnvironmentVariable("ANTHROPIC_API_KEY", "sk-ant-...", "User")
   ```
2. In the app: **Us → Turn AI on**, then **Generate this week's recap**.

Without a key (or with AI off), recaps are assembled locally from the week's
data — no network needed.

## Layout

```
src/server.js    Express server + JSON API (port 3467)
src/db.js        SQLite schema + seed (better-sqlite3, WAL)
src/recap.js     Weekly recap: local assembly or Claude (claude-opus-4-8)
public/          Touch UI (vanilla JS PWA)
mcp/mcp-server.js  MCP stdio server for Claude Desktop
data/            The database (back this up)
```

````


---
End of handoff. After writing all files: npm install, npm start, then work through the verification checklist.
