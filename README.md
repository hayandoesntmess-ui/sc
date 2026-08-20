# ScienceCare Academic Aid — Live Class Rig

A web-based coaching/classroom platform built as a **production/filming tool**.
One Android device shows the student-facing classroom page (the screen being
filmed), while a separate admin/production device controls the simulated
comments and reactions that appear on it. The live video comes from a real
YouTube Live stream.

There are no real students, no real viewers, no user accounts, and no database.
Everything the viewer shows is a prop controlled by the operator.

```
Teacher/actor (Android camera) -> YouTube Live -> viewer device (filmed)
Admin/production device       -> Firebase RTDB -> viewer device updates live
```

## Architecture

- Two static pages: `index.html` (viewer, Android-app styled PWA) and
  `admin.html` (production panel).
- The comment/reaction simulation engine runs **in the viewer page**. The admin
  only broadcasts control state (on/off, rate, weights, manual triggers), so a
  network blip on the admin side never stops the show.
- Realtime channel: **Firebase Realtime Database (free Spark plan)**, browser
  SDK only. Without a Firebase config the app runs in **demo mode**
  (BroadcastChannel sync between tabs on the same device) so you can test
  everything locally first.

## Running locally (demo mode, no Firebase needed)

Serve the folder over HTTP (ES modules + fetch require a server, not `file://`):

```bash
python3 -m http.server 8080
```

Then open two tabs on the same machine:

- `http://localhost:8080/` — the viewer page
- `http://localhost:8080/admin.html` — the production panel

Start comments from the admin panel; they appear on the viewer in real time.

## Firebase setup (real admin <-> viewer sync)

1. Create a Firebase project at https://console.firebase.google.com
2. Add a **Web app**; copy the config object.
3. In Realtime Database, create a database (test mode is fine — the data here
   is non-sensitive control state).
4. Copy `js/firebase-config.js.example` to `js/firebase-config.js` and paste
   your config values. This file is gitignored.
5. Reload admin + viewer. The admin header shows "Firebase connected".

## YouTube Live setup (Android streaming)

- **Option A (channel has 50+ subscribers):** use the YouTube app's **Go Live**.
- **Option B (under 50):** create a live event in YouTube Studio (web, on a
  laptop) with a stream key, then push the Android camera to it with a free
  RTMP app such as Larix Broadcaster.
- Set the broadcast visibility to **Unlisted** and make sure **"Allow
  embedding"** is ON.
- In the admin panel set **YouTube embed URL or channel ID** to
  `https://www.youtube.com/embed/live_stream?channel=CHANNEL_ID` (or just the
  channel ID). The viewer embeds it automatically.

## Content editing (no code changes)

All editable content lives in `content/`:

```
content/
  names.txt               one commenter name per line
  highlighted.txt          Name | Message | likes   (pinnable comments)
  categories/
    greetings.txt          one comment per line
    praise.txt
    questions.txt
    banter.txt
    (add more files here)
  scenes/                  optional scene-specific comment pools
    (scene).txt            one comment per line
  manifest.json            lists categories + scenes, default weights, title
  reactions.json           named emoji sets
```

- **Add a category:** create `content/categories/<name>.txt`, then add the name
  to `"categories"` in `content/manifest.json`.
- **Add a scene:** create `content/scenes/<name>.txt` and list it in
  `manifest.json`; it becomes selectable in the admin panel.
- **Swap the logo:** replace `assets/logo.jpg`.
- Comment lines starting with `#` are ignored. Keep files UTF-8.

## Admin panel quick guide

- **Class** — title, YouTube URL/channel, live viewer count, Start/Stop,
  Pause/Resume, Clear chat.
- **Comments** — per-minute rate and a weight slider per category; toggle
  categories on/off.
- **Reactions** — per-minute rate and emoji-set toggles.
- **Scenes** — activate a scene comment pool (adds a "scene" weight).
- **Manual triggers** — send a custom comment, random comment from a category,
  reaction burst, pin/unpin a highlighted comment, clear chat.
- **Live feed** — echoes what the viewer is currently showing.

## Hosting

Static pages can be hosted free on GitHub Pages / Cloudflare Pages / Netlify
(no cold start, no sleeping). Realtime is Firebase free tier. No database.

## Filming notes

- The comments in `content/` are romanized Bangla (Latin script), so no
  Bengali font dependency on the viewer device.
- The viewer page requests a screen Wake Lock so the phone does not sleep
  during a take.
- Internet is required during filming (for the YouTube stream and realtime).
  The service worker is network-first so content edits never go stale.
