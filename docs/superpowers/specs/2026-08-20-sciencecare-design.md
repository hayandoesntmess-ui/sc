# ScienceCare Academic Aid — Design Document

Date: 2026-08-20
Repo: github.com/hayandoesntmess-ui/sc
Status: Approved (2026-08-20)

## Purpose

ScienceCare Academic Aid is a **production/filming tool**, not a real online classroom.
During filming there is exactly one viewer device showing a student-facing classroom page,
and one admin/production device that controls what appears on it. There are no real
students and no public viewers.

The teacher/actor performs in front of a camera. A real, live video stream is embedded in
the classroom UI while the surrounding classroom activity (simulated comments and
reactions using Bengali/Bangalee names and romanized-Bangla comments) is controlled live
by the production operator.

## Goals / Non-Goals

Goals:
- One student-facing page that looks like a normal Bangladeshi coaching/online-class
  platform and is styled like an Android app.
- A simple production control panel (fast, obvious controls).
- Simulated comments/reactions driven from editable content files (names, comment sets,
  reaction/emoji sets, scenes).
- Real live video from YouTube Live (embedded), streamed from an Android device.
- Admin controls reach the viewer in real time.
- Free hosting, minimal infrastructure, no database.

Non-goals:
- Real users, student accounts, payments, attendance, class scheduling, chat archives.
- YouTube Live Chat is never used.

## Architecture

Two static pages + a free realtime channel. No custom server, no database.

```
ADMIN DEVICE  -> writes config + commands -> REALTIME CHANNEL (Firebase RTDB free tier)
                                                   |
                                                   v  subscribes + auto-updates
                                            VIEWER DEVICE (Android, being filmed)
                                            |  YouTube Live embed
                                            |  comment/reaction simulation engine (local)
                                            |  PWA fullscreen, Android-app look
                                                   |
                                                   v echoes what is on screen
                                            (back to admin live feed)
```

Design decision: the simulation engine runs **in the viewer**, not the admin and not a
server. The admin only sends control state (on/off, rate, weights, enabled sets, manual
triggers). The viewer owns timing/randomness/rendering, so a network blip on the admin
side never stops the show. "What is being sent to the viewer" is solved by the viewer
echoing each rendered event back to the admin as a live feed.

### Fallback realtime

If no Firebase config is present (development or LAN-only shoot), the same realtime API is
provided by a BroadcastChannel adapter so two tabs on the same device can sync. This makes
the app testable before Firebase is configured.

## Components

- `index.html` (viewer page, student-facing, PWA, Android-app look)
- `admin.html` (production panel, desktop)
- `js/config.js` — app defaults
- `js/loader.js` — reads names, comment categories, scenes, reactions
- `js/simulation.js` — pure weighted-random comment/reaction engine
- `js/realtime.js` — swappable Firebase / BroadcastChannel adapter
- `js/viewer.js` — viewer page logic
- `js/admin.js` — admin panel logic
- `js/firebase-config.js` (gitignored) + `.example` — Firebase credentials
- `manifest.webmanifest`, `sw.js` — PWA (add to home screen, fullscreen)
- `content/` — all editable content data (see below)

## Content data formats

- `content/names.txt` — one display name per line (English transliteration), `#` comments.
- `content/categories/<name>.txt` — one comment per line, `#` comments. Every file in the
  manifest's category list becomes a selectable comment category.
- `content/scenes/<name>.txt` — optional scene-specific comment pools. Selecting a scene
  in the admin adds it as an extra weighted category.
- `content/reactions.json` — named emoji sets:
  `{ "sets": { "basic": ["...", "..."], "energetic": ["...", "..."] } }`
- `content/manifest.json` — lists categories, scenes, and the emoji category weight.
- `content/highlighted.txt` — pinned messages as `Name | Message | likes`.

The "emoji" category is generated from the reaction emoji sets (1-3 emojis), no file needed.

Adding content = editing/adding a text file + updating the manifest. No core code changes.

## Realtime contract (Firebase RTDB)

- `control/config` — the full broadcast config object (admin owns, viewer consumes):
  `{ running, classTitle, youtubeUrl, commentRatePerMin, reactionRatePerMin, weights,
     enabledCategories, enabledEmojiSets, scene, liveViewerCount, showPinned,
     manualTrigger }`
- `manualTrigger` — one-shot command `{ id, type, payload }`; types: `comment`,
  `reaction`, `pin`, `unpin`, `clear`. Viewer dedupes by `id`.
- `feed` — viewer writes `{ events: [last ~20], at }`; admin renders as a live ticker.
- `status` — viewer heartbeat `{ online: true, at }` so admin can see if the viewer is
  connected.

## Viewer page (Android-app look)

- PWA: manifest + service worker (network-first), "Add to Home Screen", fullscreen.
- Material 3 style, dark theme, system status bar theming, safe-area insets.
- App bar: logo (logo.jpg) + class title + LIVE badge.
- 16:9 YouTube Live embed (`youtube.com/embed/live_stream?channel=...&autoplay=1&rel=0`)
  from the admin-supplied URL.
- Chat: native-messaging-style bubbles (name + text + time), auto-scroll, capped list,
  fade for old items, optional pinned-message strip.
- Reactions: emoji burst overlay on the video + like counter.
- Simulated live viewer count (optional, admin-set base count).
- Screen Wake Lock so the phone does not sleep during filming.

## Admin panel

- Class: title + YouTube URL + big START/STOP + pause/resume + clear chat.
- Comments: rate (per min), per-category weight sliders, category enable toggles.
- Reactions: rate (per min), emoji-set toggles.
- Scenes: selector (manifest scenes).
- Manual: send specific comment / random from category / reaction burst / pin from
  highlighted list / clear.
- Live feed: viewer echo ticker + viewer online status + engine state.

## Streaming setup (Android)

- Option A (channel has 50+ subscribers): YouTube app -> Go Live (phone camera).
- Option B (under 50): Larix Broadcaster (free) -> RTMP stream key from a YouTube Studio
  Live event.
- Broadcast visibility: Unlisted, "Allow embedding" ON.
- Viewer embed uses the channel-live endpoint so no per-session video ID is needed.

## Hosting

- Static files: GitHub Pages (Actions on push) or Cloudflare Pages / Netlify — all free,
  no cold start.
- Realtime: Firebase Realtime Database, Spark (free) plan, browser SDK, no backend.
- No database. RTDB stores the small control snapshot only; chat is ephemeral.

## Risks

- Internet outage kills video and remote control (comments keep flowing locally).
- YouTube prerequisites (verification, embedding) must be ready days before the shoot.
- Embed autoplay/overlay quirks on the actual viewer device — test early.
- Free-tier realtime quotas are far beyond 2 devices; no SLA, low risk.
- Static-host CDN caching of edited content on shoot day — use cache-busting.
- Android phone auto-sleep — handled by Wake Lock.

## Roadmap

1. Content data + core modules
2. Viewer page
3. Admin panel
4. PWA + README
5. Local two-tab test
6. Preview deploy + push
7. User instructions: Firebase project + config file, YouTube channel setup
