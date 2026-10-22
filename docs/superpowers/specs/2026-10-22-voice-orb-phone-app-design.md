# Voice Orb phone: floating "Jarvis" bubble app, Claude hand-off, and web app polish

Date: 2026-10-22
Status: draft for approval

## Why

The owner uses Voice Orb on a **Samsung Galaxy S26 Ultra**, with the screen on, on the table or
while driving (phone on lap today; a mount is recommended). Car: phone on **Bluetooth**, cabin
**usually quiet**. Their real use case: speak an idea, have free Gemini turn it into an **expert
prompt**, and give that prompt to the **Claude app**, which does the actual work. They want it to
feel like Jarvis from Iron Man: talk, hear it answer, never touch the phone while driving, with a
**floating orb that hovers over the Claude app**. They want a real installable Android app, free, no
Play Store. They haven't yet used the web version on the phone itself.

Nothing annoys them about the current app, so the existing web flow must keep working as is.

## Goals

1. **Native Android app with a floating orb bubble** that stays on top of other apps (Claude above
   all), with tap-to-talk and hands-free.
2. **Hands-free "Jarvis" mode** in the bubble: tap once to arm; "Hey Orb" starts each note; the mode
   is spoken; the note sends itself on a pause; a chime; a short part is read aloud.
3. **Claude hand-off**: every result is copied for pasting into Claude; several prompts per drive are
   queued and sent one by one after parking.
4. **Web app polish**: Send to Claude button, install button, battery-friendly animation, S26 Ultra
   layout.
5. **Real-phone check** on the S26: a plain-language checklist, and fixes for what it finds.

## Non-goals

- Play Store or any paid publishing.
- Claude doing the analysis inside Voice Orb (no Claude API, no cost). Gemini stays the only model
  Voice Orb calls.
- Typing into Claude's message box automatically (would need the Accessibility permission). The
  owner pastes.
- Listening with the screen off or from the pocket.
- A card or panel on the bubble. The owner chose **orb only, voice for everything**.
- iPhone support beyond what exists today.

## Anti-goals (would be a failure even if it "works")

- Anything that makes the driver look at or touch the phone to complete a normal note.
- Claude (or any app) opening by itself while driving.
- The app hearing its own voice and treating it as a new note.
- **Constant beeping**: Android's recogniser often plays a tone each time it starts listening;
  hands-free must not beep every few seconds for a whole drive.
- A queued prompt being silently lost (evicted, overwritten, lost on restart).
- A Gemini key or the APK signing key ending up in this public repo.
- Breaking the current web tap-to-talk flow, history, pins, copy, or usage meter.

## Constraints

- Free Gemini tier: about 20 requests per model per day, with fallback across models on 429 (as
  `js/gemini.js` does). **One Gemini call per note**, nothing extra (no second call for a spoken
  version).
- Each user brings their own Gemini key, entered on the phone, stored only on the device.
- Public repo `BENEVOLENT69/voice-orb-phone`. The web app is static, dependency-free, served by
  GitHub Pages from `master`. When cached web files change, bump `CACHE` in `sw.js` and keep `ASSETS`
  in sync (a test enforces it). Keep the strict CSP.
- Shared web files (`modes.js`, `usage.js`, `gemini.js`, `orb.js`, `bear.js`) are copies of the
  desktop app's. Prefer phone-only changes; if a shared file must change, keep it small and note it
  for the desktop copy.
- Android: drawing over other apps needs the "Display over other apps" permission; listening while
  another app is in front needs a foreground service (microphone type) with a notification, started
  while Voice Orb is visible.
- Build tools: the owner approved installing a JDK and the Android SDK on their Windows PC. Report
  what was installed.

## The design (decided with the owner)

### A. The Android app (new, native)

- A real Android app (Kotlin) built from this repo (my call: an `android/` folder), sideloaded as a
  signed `.apk`. This replaces the earlier idea of wrapping the website with PWABuilder, so no
  `benevolent69.github.io` site or asset-links file is needed.
- **Signing key**: generated on the owner's PC and kept outside the repo (my call:
  `C:\Users\sucha\voice-orb-keys\`), with a plain note on why it matters: lose it and updates can't
  install over the existing app. `.gitignore` guards against keystores.
- **Main screen** (my call, kept simple): paste Gemini key; switches for **hands-free** and
  **show bubble**; the **Waiting for Claude** queue; recent notes; the usage meter; permission
  prompts explained in plain words.
- The app needs its own key entry. Its notes and usage counts are separate from the web app's.

### B. The floating orb bubble

- A small glowing orb that floats over any app and can be dragged; it snaps to an edge. No card.
- **Tap** = start/stop a note (same flow as the web orb: choose the mode by voice, speak, pause sends).
- The orb's look shows the state (idle, listening, thinking, speaking) and animates only as much as
  that state needs.
- Results are **always copied to the clipboard** and added to the queue (C), with a spoken "copied".
- The modes and their instructions are the same four as `js/modes.js`, including spoken mode
  matching ("one", "prompt", "summary"…).

### C. Claude hand-off and the queue

- Every result from a drive goes into **Waiting for Claude**, saved on the phone so it survives
  restarts, never pushed out by newer notes. Several per drive is normal.
- After parking: in the app, **one tap per queued prompt** opens Android's share sheet (Claude is
  picked) or copies it. Each is marked done once sent. A queued item can also be deleted.
- The latest result is also on the clipboard, so a single prompt can just be pasted into Claude.
- Voice: "Hey Orb, read it again" re-reads the latest; "cancel"/"stop" drops the current note.

### D. Hands-free in the bubble

- A hands-free switch in the app. Tapping the bubble once arms it; tapping again disarms.
- While armed it waits for **"Hey Orb"**, matched forgivingly. Then the owner says the mode first
  ("Hey Orb, summary, …"). If none is named, it asks out loud "What are we doing?".
- The note sends itself on a pause. Then: **a short chime**, and it **reads the first line or so of
  the result**, then says something like "say 'read it again' for the rest". It's copied and queued.
- It **stops listening while it speaks**, then goes back to waiting for "Hey Orb".
- **No constant beeping** (anti-goal). How to get there is the builder's call (for example, silencing
  the recogniser's start tone, or an offline wake-word listener), but it must be **proven on the
  S26 early**, before the rest is built on it.
- Audio: spoken replies and the chime play through the car over Bluetooth; listening may use the
  phone's own mic, since the cabin is usually quiet.
- The screen stays on while armed.

### E. Web app polish (the website version)

My call: hands-free lives in the bubble app, because that's where driving happens. The website keeps
tap-to-talk and gets:

- **Send to Claude** button beside the output (Android share sheet; falls back to copy).
- **Install Voice Orb** button when Chrome offers installation; hidden once installed.
- **Battery**: `orb.js` and `bear.js` draw every frame forever (120 Hz on the S26). Cap the frame
  rate (about 30 fps active, much lower idle) and stop when the page is hidden.
- **Layout**: tidy on the S26 Ultra so the orb, modes, both boxes and the bear fit comfortably;
  respect safe areas. The bear stays.

### F. Real-phone check

- A short plain-language checklist the owner runs on the S26: web app (mic permission, listening
  continues after pauses, copy, Send to Claude, install); Android app (install from file, permissions,
  bubble over Claude, tap-to-talk, hands-free in a quiet room and in the car over Bluetooth, no
  constant beeping, chime and read-aloud, no self-hearing, queue after parking). Fix what it finds.
  Optionally USB debugging so logs can be read from the PC.

## Order of work

1. Prove the beep-free hands-free listening on the S26 (the riskiest part).
2. Android app: bubble with tap-to-talk, Gemini, copy, queue.
3. Hands-free in the bubble.
4. Web polish (can run alongside 2 and 3; it touches different files).
5. Real-phone checklist on both, then fixes.

## Left to the builder

Wake-phrase matching rules; chime sound; exact spoken phrases; how "the first line or so" is cut
from each mode's output; the beep-free listening technique; how the Kotlin side reuses the modes
and the Gemini fallback (port, or share a data file); recent-notes limits outside the queue;
frame-rate numbers; visual details; minimum Android version (the S26 runs current Android);
test structure for the Android code.
