# lola-mark-ollie

Two apps live here.

## 1. Lola + Mark + Ollie (kitchen tablet)
Local-first shared calendar and daily-connection app. `npm install && npm start`, then open http://localhost:3467.
Full rebuild instructions, kiosk setup, and the Claude Desktop MCP server are in **HANDOFF.md**.
Code: `src/`, `public/`, `mcp/`.

## 2. Bedside Español (Lauren's Spanish practice app)
Duolingo-style Spanish practice for nurses. Lives in **`bedside-espanol/`** and deploys to GitHub Pages
automatically on every push to `main` that touches that folder.

**Live app:** https://mwscoracle.github.io/lola-mark-ollie/

**Install on an iPhone:** open that address in **Safari** → Share → **Add to Home Screen**. It then runs
full screen with its own icon, works offline, and keeps progress on the phone. Profile tab → Backup code
moves progress between phones.

**Updating the app:** edit `bedside-espanol/index.html` (lessons, scenarios, and glossary are plain data
near the top of the script), bump `CACHE='bedside-v1'` in `bedside-espanol/sw.js` to `v2`, push to `main`.
Phones pick up the new version the next time the app opens with internet.

**One-time setup after the first push:** repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
(GitHub Pages on a private repo needs GitHub Pro; otherwise make the repo public under Settings → General → Danger Zone.)

`ios-native/` holds the alternative native-iOS (Capacitor/Xcode) build of the same app; it is not needed for the web version.
