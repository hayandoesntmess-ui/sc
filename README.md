# ScienceCare Academic Aid — Live Class Rig

A local, no-internet-required rig for shooting a "live coaching class" scene:
one device streams live video (the teacher), one device displays the styled
platform UI with live chat (the phone being filmed), and a third device
(hidden operator) controls everything.

No accounts, no cloud, no npm install. Just Node.js and one laptop on the
same WiFi as the other two devices.

---

## 1. What you need

- A laptop with **Node.js** installed (v16+). Check with `node -v` in a
  terminal. If not installed, get it from nodejs.org — one-time setup,
  no internet needed on shoot day after that.
- All three devices (broadcaster, viewer phone, admin device) on the
  **same WiFi network** (a phone hotspot works fine too — connect the
  laptop and other devices to it).

## 2. Running it

1. Copy this whole folder onto the laptop.
2. Open a terminal in this folder.
3. Run:
   ```
   node server.js
   ```
4. You'll see a message with your local IP address instructions. Find your
   laptop's actual local IP:
   - **Windows:** open Command Prompt, run `ipconfig`, look for "IPv4 Address"
     (something like `192.168.1.23`)
   - **Mac:** System Settings → Wi-Fi → Details, or run `ifconfig` in Terminal
   - **Linux:** run `ip a`

5. On each device, open a browser to `http://<that-ip>:8080/<role>`:
   - Teacher/actor's device → `http://192.168.1.23:8080/broadcaster`
   - Filmed phone → `http://192.168.1.23:8080/viewer`
   - Operator's device → `http://192.168.1.23:8080/admin`

   (Replace `192.168.1.23` with your laptop's real IP.)

6. On the broadcaster device, **allow camera and microphone access** when
   prompted. A small dot in the top-left turns green once it's live and
   connected to the viewer.

7. On the viewer phone, the video should appear within a few seconds.
   That's the screen you film.

8. On the admin device, start firing chat categories and pin questions —
   nothing here shows up on camera unless you're filming the operator's
   screen, which you shouldn't be.

## 3. Before each take

Tap **"New take (reset)"** at the top of the admin panel. This clears the
chat, un-pins any question, and resets the video connection so broadcaster
and viewer reconnect cleanly. Do this once before every take to avoid stale
chat carrying over.

## 4. Editing content (no coding needed)

Everything the chat says lives in plain `.txt` files in the `content/`
folder. Edit with Notepad, TextEdit, or any plain text editor — save as
**UTF-8** if you're using emojis or non-English characters (most editors
default to this already).

```
content/
  names.txt              one commenter name per line
  highlighted.txt         one preset "top question" per line, format:
                           Name | Question | Upvote count
  categories/
    greetings.txt         one comment line per line
    praise.txt
    questions.txt
    banter.txt
    (add more .txt files here — they show up as new buttons automatically)
```

**Adding a new chat category:** just drop a new `.txt` file into
`content/categories/` (e.g. `emojis.txt`) with one line per comment.
Restart the server (`Ctrl+C` then `node server.js` again) or just reload
the admin page — it picks up new files automatically. No code changes.

**Swapping the logo:** replace `assets/logo.jpg` with your final logo
(same filename, or update the path in `public/viewer/index.html` if you
rename it).

**Changing the class title / platform name:** open
`public/viewer/index.html` and edit the text inside `.channel-name` and
`#classTitle`.

## 5. How the admin panel works

- **Categories** (Greetings, Praise, Questions, Banter, etc.) — each has
  its own Quantity, Per-minute rate, and a Loop checkbox. Hit **Start** on
  one category for a queued single-topic flood, or start two or three at
  once and they'll blend together naturally in the viewer's chat.
- **Top voted question** — tap **Pin** on a preset question, or type a
  custom one and hit **Pin this**. Only one shows at a time on the viewer's
  screen. **Dismiss pinned** clears it.
- **Manual message** — fire one specific line on demand, useful for
  reacting to something happening in the scene in the moment.
- **Live feed preview** at the bottom mirrors what's being sent, so the
  operator can track pacing without watching the viewer phone directly.

## 6. Troubleshooting

- **Video not appearing on viewer:** confirm all three devices are on the
  *same* WiFi network (not one on WiFi and one on mobile data). Hit reset
  on the admin panel and reload the broadcaster and viewer pages.
- **"Camera/mic error" on broadcaster:** the browser blocked camera access.
  Check site permissions (usually a padlock/camera icon in the address bar)
  and reload.
- **Laptop's IP changed:** this can happen if you reconnect to WiFi. Re-run
  `ipconfig` / `ifconfig` and use the new address on all three devices.
- **Nothing loads at all:** make sure `node server.js` is still running in
  the terminal — closing that terminal window stops the whole rig.

## 7. Notes for post-production

- The video shown to the viewer is the **live composited output** — what
  the camera films off the phone screen is the actual final look, chat and
  all. No separate compositing pass needed for the chat overlay.
- If editorial also wants a clean isolated camera feed of the actor
  (for reframing/regrading), that's a separate capture on production's
  end — this rig only handles what's rendered inside the phone's screen.
- Chat pacing is naturally non-identical take to take (since the operator
  fires it live), which gives editorial real variation to choose between
  without needing multiple pre-rendered versions.
