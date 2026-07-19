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
