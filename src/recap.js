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
