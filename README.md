# Bedside Español — iOS app

Duolingo-style Spanish practice for nurses, packaged as a native iOS app.
Progress is saved in the phone's own storage (Capacitor Preferences) and survives
closing the app, restarting the phone, and iOS updates. The speaking exercises use
Apple's on-device speech recognizer through a small Swift plugin in this project.

## What's in here

| Path | What it is |
|---|---|
| `www/index.html` | The whole app (UI, lessons, scenarios, glossary) |
| `www/native.js` | Bridge from the web app to native storage and speech |
| `ios/App/App/SpeechPlugin.swift` | Native speech recognition (SFSpeechRecognizer) |
| `ios/App/App/BedsideViewController.swift` | Registers the plugin with Capacitor |
| `ios/App/App/Info.plist` | Microphone + speech permission text |
| `capacitor.config.json` | App id, name, splash colors |
| `resources/` | 1024px icon and splash source images |

## One-time setup on your Mac (about 20 minutes, mostly downloads)

1. **Install Xcode** from the Mac App Store (free, large). Open it once and accept the license.
   Then in Terminal: `xcode-select --install` (skip if it says already installed).
2. **Install Node.js** if you don't have it: https://nodejs.org (LTS). Check with `node -v`.
3. **Unzip this project** somewhere like `~/Projects/bedside-ios`.
4. In Terminal:
   ```bash
   cd ~/Projects/bedside-ios
   npm install
   npx cap sync ios
   npx cap open ios
   ```
   Xcode opens the project. The first open takes a minute while Swift packages resolve.

## Signing (so it runs on a real iPhone)

In Xcode, click the blue **App** project at the top of the left sidebar, then the **App** target,
then **Signing & Capabilities**:

- Tick **Automatically manage signing**
- **Team**: pick your Apple Developer team
- **Bundle Identifier**: `com.markwilson.bedsideespanol` (change if it says it's taken)

## Put it on Lauren's phone

**Fastest (direct install, good for testing):**
1. Plug her iPhone into the Mac with a cable. On the phone, tap **Trust**.
2. In Xcode's toolbar, choose her iPhone as the run destination (next to the Play button).
3. Press **Play** (⌘R). The first time, the phone will say the developer isn't trusted:
   on the phone go to **Settings → General → VPN & Device Management → your Apple ID → Trust**.
4. Run again. The app is installed. It stays installed (a paid developer account gives a 1-year cert).

**For an install without a cable, or so it survives a year (TestFlight):**
1. In Xcode: **Product → Archive**. When it finishes, click **Distribute App → TestFlight & App Store → Upload**.
2. Go to https://appstoreconnect.apple.com → **My Apps → + → New App**, pick the bundle id, name "Bedside Español".
3. Under **TestFlight**, add Lauren as an internal tester (her Apple ID email).
4. She installs the **TestFlight** app from the App Store and gets an invite. Builds last 90 days; upload a new one whenever you change the app.

## Updating the app after you change the content

Edit `www/index.html` (lessons, scenarios, and glossary are plain JS data near the top of the script), then:
```bash
npx cap sync ios
```
and press Play in Xcode again (or Archive for TestFlight).

## Things to know

- **Speech recognition** needs iOS 15+ and an internet connection for the best accuracy; iOS falls back to
  on-device recognition on newer phones. The first speaking exercise asks for microphone and speech permission.
- **Audio playback** of Spanish uses the iPhone's built-in voices. For a better voice: Settings → Accessibility →
  Spoken Content → Voices → Spanish → download an Enhanced voice (e.g. Mónica or Paulina).
- **Progress** lives only on the phone. Deleting the app deletes progress. If you later want it backed up to iCloud,
  the Preferences plugin can be swapped for NSUbiquitousKeyValueStore in `native.js`/a small Swift plugin.
- **Testing in a plain browser** still works: `npx serve www` and open the URL on a phone. In a browser it uses
  browser storage and the browser mic instead of the native ones.

## If something fails

- *"No such module 'Capacitor'"*: in Xcode, **File → Packages → Resolve Package Versions**, then build again.
- *Signing error about the bundle id being taken*: change `appId` in `capacitor.config.json`, run `npx cap sync ios`, and update the Bundle Identifier in Xcode to match.
- *Blank white screen on launch*: run `npx cap sync ios` (the web files weren't copied into the iOS project).
- *Mic button says permission denied*: on the phone, Settings → Bedside Español → allow Microphone and Speech Recognition.
