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
