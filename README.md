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
