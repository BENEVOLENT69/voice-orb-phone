# Voice Orb Bubble App + Web Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a native Android app with a floating, hands-free "Jarvis" orb that sits over the Claude app, and polish the existing web app (Send to Claude, install button, battery, S26 Ultra layout).

**Architecture:** The web app stays a static, dependency-free PWA; the polish is phone-only files plus small `app.js`/CSS/HTML changes. The Android app is a new Kotlin project in `android/`. It has no third-party runtime dependencies and uses only framework APIs: `SpeechRecognizer`, `TextToSpeech`, `WindowManager` overlay, a foreground service, `HttpURLConnection` and `org.json`. All decision logic (modes, wake word, spoken preview, usage, Gemini fallback, note queue, the hands-free state machine) lives in plain Kotlin classes behind small interfaces, so JVM unit tests cover it. The Android-specific shells (service, overlay view, activity) stay thin. The mode instructions are exported from `js/modes.js` to a JSON asset, so the web, desktop and Android apps share one source.

**Tech Stack:** HTML/CSS/vanilla JS + `node --test` (web). Kotlin, Android Gradle Plugin, Gradle wrapper, JUnit 4, `org.json` for JVM tests (Android). Microsoft OpenJDK 17 + Android command-line tools on Windows.

**Spec:** `docs/superpowers/specs/2026-10-22-voice-orb-phone-app-design.md`

## Global Constraints

- Free Gemini tier: **one Gemini call per note**. Models and order are copied from `js/gemini.js`: `gemini-3.5-flash`, `gemini-flash-lite-latest`, `gemini-3.5-flash-lite`. On 429, skip to the next model. Retry 503 twice, 700 ms apart. The daily limit is 20 per model, and the quota day is midnight `America/Los_Angeles`.
- REST endpoint `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`. Send the key in the `x-goog-api-key` header, never in the URL. The prompt text matches `buildSummaryPrompt` in `js/gemini.js` exactly.
- No Gemini key and no keystore/passwords in the repo. Keys live at `C:\Users\sucha\voice-orb-keys\`. `.gitignore` must cover `*.jks`, `*.keystore`, `keystore.properties`, `android/local.properties`, `android/.gradle/`, `android/build/`, `android/app/build/`.
- Web: when a cached file changes, bump `CACHE` in `sw.js` (start: `voice-orb-v1` → `voice-orb-v2`; one bump per push to `master`) and keep `ASSETS` in sync. `tests/browser-load.test.js` enforces this. Keep the CSP strict.
- Don't edit the shared desktop copies (`js/modes.js`, `js/usage.js`, `js/gemini.js`, `js/orb.js`, `js/bear.js`).
- Android: package `com.benevolent69.voiceorb`, app name "Voice Orb", `minSdk 29`, `targetSdk`/`compileSdk 35`. Use the newest stable AGP/Kotlin/Gradle that resolves at build time. The plan assumes AGP 8.7.3, Kotlin 2.1.0, Gradle 8.11.1; bump if they don't resolve.
- Plain-language strings everywhere the owner reads or hears them. Spoken replies are short.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Push to `master` only for approved work. Publishing an APK as a GitHub Release is outward-facing, so ask the owner first.

## Review Focus

1. **Recognizer hears the app's own voice:** listening must be stopped before TTS/chime starts and only resume after TTS `onDone`. Test in Task 8: `speakingPausesListening`.
2. **Gemini fails mid-drive** (no signal, quota gone, bad key): it must say a short plain sentence, keep the raw note in the queue (output empty, status QUEUED), and return to waiting for "Hey Orb", never stuck in THINKING. Test in Task 8: `geminiFailureKeepsRawNoteAndRearms`.
3. **App killed or phone restarted with queued prompts:** the queue survives. Test in Task 6: `queueSurvivesReload`.
4. **Wake word inside ordinary speech** ("I'll hey or something") vs real "Hey Orb, summary…": only a phrase-initial match triggers. Test in Task 6: `wakeOnlyAtStart`.
5. **Mic permission or overlay permission denied/revoked:** the bubble doesn't start, and the main screen explains in plain words what to switch on. Test in Task 9: manual checklist item plus `permissionsMissingListsWhatToEnable` unit test on `PermissionCheck`.

---

## Part 1 — Web polish

### Task 1: Battery: frame-rate cap for the orb and bear

**Files:**
- Create: `js/frame-cap.js`
- Modify: `index.html` (load `js/frame-cap.js` **before** `js/orb.js`), `sw.js` (add to `ASSETS`, bump `CACHE` to `voice-orb-v2`), `tests/browser-load.test.js` (add file to the shared-scope list)
- Test: `tests/frame-cap.test.js`

**Interfaces:**
- Produces: `createFrameCap({ raf, now, fpsFor }) -> wrappedRaf(cb)`. When loaded in a page it installs itself: `window.requestAnimationFrame = createFrameCap({ raf: original, now: () => performance.now(), fpsFor: () => FPS[document.body.dataset.state] })` with `FPS = { idle: 8, choosing: 30, listening: 30, thinking: 30 }` (missing state → 30). Exported as `window.VoiceFrameCap` / `module.exports = { createFrameCap, FPS }`.

Approach: the wrapped function calls the real `raf`. If less than `1000 / fpsFor()` ms has passed since the last frame it delivered, it re-queues itself instead of calling `cb`. Chrome already stops `raf` on hidden pages, so nothing is needed for that.

- [ ] **Step 1: Write failing tests** in `tests/frame-cap.test.js` with a fake `raf` (stores callbacks; `tick(ms)` advances a fake clock and runs them):
  - `delivers at most fps frames per second`: `fpsFor = () => 30`; ticking every 8 ms for 1000 ms → callback runs between 29 and 31 times.
  - `idle runs slower`: `fpsFor = () => 8` → 7–9 calls in 1000 ms.
  - `changing state takes effect on the next frame`: switch from 8 to 30 midway; the second half has more calls than the first.
- [ ] **Step 2:** Run `npm test`. Expected: the new tests FAIL (module missing).
- [ ] **Step 3:** Implement `js/frame-cap.js` as above. Wire it into `index.html`, `sw.js` and `browser-load.test.js`.
- [ ] **Step 4:** Run `npm test`. Expected: all pass (26 + 3).
- [ ] **Step 5:** Commit: `perf: cap orb and bear frame rate to save battery`.

### Task 2: Send to Claude and Install buttons

**Files:**
- Create: `js/share.js`
- Modify: `index.html` (output pane head gets `<button id="send-claude">Send to Claude</button>`; `#bar` gets `<button id="install" hidden>Install Voice Orb</button>`; load `js/share.js` before `js/app.js`), `js/app.js` (wire buttons), `sw.js` (ASSETS), `tests/browser-load.test.js`
- Test: `tests/share.test.js`

**Interfaces:**
- Produces: `sendToClaude(text, { nav, copy }) -> Promise<'shared'|'copied'|'empty'|'cancelled'>`. Use `nav.share({ text })` if `nav.share` exists. An `AbortError` → `'cancelled'`. Any other error or no `share` → `await copy(text)`, return `'copied'`. Blank text → `'empty'`.
- Produces: `setupInstall({ win, button })`. It stores the `beforeinstallprompt` event (calling `preventDefault()`) and shows `button`. A click calls `prompt()` and hides the button. `appinstalled` hides it. If `win.matchMedia('(display-mode: standalone)').matches`, the button is never shown.
- `app.js`: `#send-claude` click → `sendToClaude(summaryEl.value, { nav: navigator, copy: (t) => copyText(t, btn) })`. Status messages: `'shared'` → "Sent - pick Claude in the list" (set before the share opens), `'copied'` → "Copied - paste it into Claude", `'empty'` → "Nothing to send yet".

- [ ] **Step 1: Write failing tests:**
  - `shares when the share sheet exists`: a fake nav records the text → `'shared'`.
  - `falls back to copy when share is missing or fails`: → `'copied'`, and copy is called with the text.
  - `cancel is not a copy`: share rejects with `{ name: 'AbortError' }` → `'cancelled'`, and copy is not called.
  - `empty text does nothing`.
  - `install button appears only after Chrome offers it, and hides once installed` (fake win with event listeners and matchMedia).
  - `install button never shows when already installed`.
- [ ] **Step 2:** `npm test` → new tests FAIL.
- [ ] **Step 3:** Implement `js/share.js`, wire it in `app.js`/`index.html`/`sw.js` (still `voice-orb-v2`, not yet pushed).
- [ ] **Step 4:** `npm test` → all pass.
- [ ] **Step 5:** Commit: `feat: Send to Claude and Install buttons`.

### Task 3: S26 Ultra layout, verified in the browser

**Files:**
- Modify: `styles.css`, `index.html` only if markup needs it

The S26 Ultra's viewport is about 384×832 CSS px. Aims:
- On first screen the mode grid, history, both text boxes (min-height 110px each) and the dock are visible without the dock covering the last control.
- Buttons are at least 44px tall.
- The `#bar` doesn't wrap awkwardly with the Install button visible.
- Text inputs are at least 16px (stops Chrome zooming on focus).
- `#main` bottom padding clears the dock and the caption.

- [ ] **Step 1:** `preview_start` with the `.claude/launch.json` server (`npm run serve`, port 8080). `resize_window` 384×832. Screenshot the setup sheet and then the main screen. To reach the main screen without a real key, set `localStorage['voiceOrb.geminiKey']='test-not-real'` via `javascript_tool` and reload. Note the overlaps.
- [ ] **Step 2:** Edit `styles.css` to fix what Step 1 showed.
- [ ] **Step 3:** Re-screenshot at 384×832 and at 412×915. Check the Install button by un-hiding it via `javascript_tool`. Expected: no overlap, no horizontal scroll (`document.documentElement.scrollWidth <= innerWidth`). Remove the fake key afterwards.
- [ ] **Step 4:** `npm test` → all pass. Commit: `style: fit the S26 Ultra screen`.
- [ ] **Step 5:** Push Tasks 1–3 to `master` (approved web work). After about a minute, `curl` the live `sw.js` and confirm it shows `voice-orb-v2`.

---

## Part 2 — Android app

### Task 4: Toolchain, project skeleton, shared modes, signing

**Files:**
- Create: `android/settings.gradle.kts`, `android/build.gradle.kts`, `android/gradle.properties`, `android/gradle/wrapper/*`, `android/gradlew`, `android/gradlew.bat`, `android/app/build.gradle.kts`, `android/app/src/main/AndroidManifest.xml`, `android/app/src/main/kotlin/com/benevolent69/voiceorb/MainActivity.kt` (placeholder "Voice Orb" text), `android/app/src/main/res/` (launcher icon from `icons/icon-512.png`, `strings.xml`), `scripts/export-modes.js`, `android/app/src/main/assets/modes.json`, `tests/modes-export.test.js`, `docs/android-build.md`
- Modify: `.gitignore`, `package.json` (`"export-modes": "node scripts/export-modes.js"`)

**Interfaces:**
- Produces: `modes.json`, shaped as `{ "summaryInstruction": string, "modes": [{ "id", "label", "hint", "keywords": "<regex source>", "instruction" }] }`. `keywords` is `m.keywords.source`; all are case-insensitive.
- Produces: a release signing config that reads `C:\Users\sucha\voice-orb-keys\keystore.properties` (`storeFile`, `storePassword`, `keyAlias`, `keyPassword`) when that file exists. Otherwise the release build is unsigned and the debug build still works.

- [ ] **Step 1:** Install the tools and report each one to the owner afterwards:
  - `winget install Microsoft.OpenJDK.17`
  - Android command-line tools from `https://dl.google.com/android/repository/` (latest `commandlinetools-win-*_latest.zip`) unpacked to `%LOCALAPPDATA%\Android\Sdk\cmdline-tools\latest`
  - `sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0"` and accept the licenses
  - `winget install Gradle.Gradle` (only used once, to generate the wrapper)
  - Set user env `JAVA_HOME` and `ANDROID_HOME`
- [ ] **Step 2: Write the failing test** `tests/modes-export.test.js`:
  - `modes.json matches js/modes.js`: requires `../js/modes`, builds the expected object as above, deep-equals the parsed asset. Failure message: "run npm run export-modes".
  - `every keyword regex is valid in Java syntax too`: each source matches `/^[\\\w()|.?*+ ]+$/` (no JS-only syntax).
- [ ] **Step 3:** `npm test` → FAIL (no asset). Write `scripts/export-modes.js`, run `npm run export-modes`, run `npm test` → PASS.
- [ ] **Step 4:** Create the Gradle project, using `gradle wrapper --gradle-version 8.11.1` inside `android/`. In `app/build.gradle.kts`:
  - JUnit 4 and `org.json:json:20240303` as `testImplementation`
  - `buildConfig = false`
  - `android:allowBackup="false"` in the manifest
- [ ] **Step 5:** Generate the keystore outside the repo:

  ```
  keytool -genkeypair -v -keystore C:\Users\sucha\voice-orb-keys\voice-orb.jks -alias voiceorb -keyalg RSA -keysize 2048 -validity 10000
  ```

  Use a strong random password. Write `keystore.properties` next to it, plus `README.txt` saying in plain words: "Keep this folder. Without it, updates to Voice Orb can't install over the app on your phone. Back it up somewhere private (not GitHub)."
- [ ] **Step 6:** Run `cd android && ./gradlew assembleDebug testDebugUnitTest assembleRelease`. Expected: BUILD SUCCESSFUL, and `app/build/outputs/apk/release/app-release.apk` exists and is signed (`apksigner verify --print-certs` shows the `voiceorb` cert).
- [ ] **Step 7:** Run `git status`. Expected: no `.jks`, no `keystore.properties`, no `build/` dirs. Write `docs/android-build.md` (install tools, build, where the key lives). Commit: `build: Android project skeleton with shared modes`.

### Task 5: Spike: beep-free continuous listening on the S26 (gate)

This is a throwaway debug screen in `MainActivity`, removed in Task 9. It decides which `ListenLoop` strategy Task 7 uses.

**Files:**
- Create: `android/app/src/main/kotlin/com/benevolent69/voiceorb/speech/ListenLoop.kt`
- Modify: `MainActivity.kt`, `AndroidManifest.xml` (`RECORD_AUDIO`)

**Interfaces:**
- Produces: `class ListenLoop(context, strategy: Strategy, callbacks: ListenCallbacks)` with `start()`, `stop()`, `val listening: Boolean`, where `enum class Strategy { ON_DEVICE, ON_DEVICE_MUTED, DEFAULT_MUTED }` and `interface ListenCallbacks { fun onPartial(text: String); fun onFinal(text: String); fun onError(code: Int) }`. Like `js/speech.js`: one utterance per session, restart on end/`ERROR_NO_MATCH`/`ERROR_SPEECH_TIMEOUT` while wanted, stop retrying on `ERROR_INSUFFICIENT_PERMISSIONS`.
  - `ON_DEVICE` uses `SpeechRecognizer.createOnDeviceSpeechRecognizer` (API 31+) when `isOnDeviceRecognitionAvailable`.
  - `*_MUTED` mutes `STREAM_NOTIFICATION` and `STREAM_SYSTEM` via `AudioManager.adjustStreamVolume(..., ADJUST_MUTE, 0)` around each `startListening` and unmutes in `stop()`. Never mute `STREAM_MUSIC`, because TTS and Bluetooth use it.
- The debug screen has three buttons (one per strategy), a Stop button, and a scrolling log of partial/final text with timestamps and session restarts.

- [ ] **Step 1:** Implement, build the debug APK, and check it runs on an emulator if one is quick to set up (otherwise skip).
- [ ] **Step 2:** Get the APK to the owner's S26. Ask the owner whether it should be a GitHub Release or USB (`adb install`). Give plain steps: allow "install unknown apps" for Chrome/Files, open the APK, Install.
- [ ] **Step 3:** The owner tries each strategy for 1 minute in a quiet room, saying "Hey Orb, summary, testing one two three" a few times. They report: beeps (yes/no), whether every "Hey Orb" appeared in the log, and anything odd.
- [ ] **Step 4 (gate):** Record the result in `docs/android-build.md` (the strategy chosen and why). If **no** strategy is beep-free and catches the wake word, stop and tell the owner. The fallback is an offline wake-word engine (Vosk), which is a new dependency of about 40 MB and needs their OK. Commit: `spike: pick beep-free listening strategy`.

### Task 6: Core logic (pure Kotlin, JVM-tested)

**Files (all under `android/app/src/main/kotlin/com/benevolent69/voiceorb/core/`, tests under `android/app/src/test/kotlin/com/benevolent69/voiceorb/core/`):**
- `Modes.kt`, `WakeWord.kt`, `SpokenPreview.kt`, `Usage.kt`, `Gemini.kt`, `NoteStore.kt`, plus `KeyValueStore.kt`

**Interfaces (produced, used by Tasks 7–9):**
- `data class Mode(val id: String, val label: String, val hint: String, val keywords: Regex, val instruction: String)`
  - `object Modes { fun parse(json: String): ModeSet }`
  - `class ModeSet(val modes: List<Mode>, val summaryInstruction: String) { fun matchSpoken(text: String): Mode? }`. The regex uses `RegexOption.IGNORE_CASE`.
- `object WakeWord { fun match(transcript: String): String? }` returns the text after the wake phrase (trimmed, may be ""), or null. It only matches at the start of the transcript, after optional leading filler (`um`, `uh`, `okay`). The phrase regex is `^(hey|hi|a|ok|okay)[ ,]+(orb|orbs|or|ord|org|door|board|aub)\b[ ,.!?]*`, case-insensitive.
- `object Commands { fun parse(afterWake: String): Command }` with `sealed class Command { object ReadAgain; object Cancel; data class Note(val text: String) }`:
  - "read it again" / "read again" / "repeat" → `ReadAgain`
  - "cancel" / "stop" / "never mind" → `Cancel`
  - anything else → `Note`
- `object SpokenPreview { fun of(modeId: String, output: String): String }`, max 200 chars, cut at a word boundary with "…":
  - `prompt` → the `TASK:` line's text
  - `feedback` → the first item under `WHAT TO CHANGE`
  - `summary` → the `GOAL:` line's text
  - `condense` → the whole output
  - Any miss → the first non-empty line, with a leading `LABEL:` removed.
- `interface KeyValueStore { fun get(key: String): String?; fun put(key: String, value: String) }`. Tests use an in-memory map; Task 7 wraps `SharedPreferences`.
- `class UsageTracker(store: KeyValueStore, dailyLimit: Int = 20, now: () -> Instant)` with `record(model)`, `markExhausted(model)`, `model(model): UsageSummary(used, limit, left, percent)`, `total(models)`. The rules and the `geminiUsage` JSON shape are copied from `js/usage.js`; quota day uses `ZoneId.of("America/Los_Angeles")`.
- `interface Http { fun post(url: String, headers: Map<String, String>, body: String): HttpResult }` with `data class HttpResult(val status: Int, val body: String)`
  - `class GeminiClient(apiKey: String, http: Http, usage: UsageTracker?, models: List<String> = DEFAULT_MODELS, sleep: (Long) -> Unit = Thread::sleep)`
  - `fun summarize(raw: String, instruction: String): String` (blocking; callers use a background thread). It throws `GeminiException(message: String, kind: Kind)`, with `enum Kind { BAD_KEY, QUOTA, NETWORK, OTHER }`.
  - `var lastModel: String?`
  - `buildPrompt(raw, instruction)` is identical to `buildSummaryPrompt`.
- `enum class NoteStatus { QUEUED, SENT }`, `data class Note(val id: Long, val modeId: String, val raw: String, val output: String, val createdAt: Long, val status: NoteStatus)`
  - `class NoteStore(store: KeyValueStore, now: () -> Long)` with `add(modeId, raw, output): Note` (status QUEUED), `markSent(id)`, `delete(id)`, `queued(): List<Note>` (oldest first), `recent(): List<Note>` (newest first, all), `latest(): Note?`
  - Keep every QUEUED note. Keep the newest 20 SENT. Persist as JSON under key `notes` on every change.

- [ ] **Step 1: Write failing tests** (one test class per file). Use the exact values above, plus:
  - `ModesTest.parsesBundledJsonAndMatchesSpokenNumbers`: read `src/main/assets/modes.json` from the test → 4 modes; `matchSpoken("number three")?.id == "summary"`; `matchSpoken("expert one")?.id == "prompt"`; `matchSpoken("banana") == null`.
  - `WakeWordTest`:
    - `"Hey Orb, summary of my day"` → `"summary of my day"`
    - `"hey or prompt build a site"` → `"prompt build a site"`
    - `"Hey Orb"` → `""`
    - `wakeOnlyAtStart`: `"I'll hey or something"` → null, `"tell them hey orb"` → null
  - `CommandsTest`: `"read it again"` → `ReadAgain`, `"cancel"` → `Cancel`, `"summary I need milk"` → `Note`.
  - `SpokenPreviewTest`: a sample of each mode's format (copy the example output from `modes.js` for `prompt`) → the expected line; a 500-char condense → ≤ 201 chars ending in "…".
  - `UsageTest`: port `tests/usage.test.js` case by case (fresh day resets, survives reload, exhausted = full, total).
  - `GeminiTest` with a fake `Http`:
    - sends the key in the header, not the URL
    - 429 on model 1 → uses model 2 and marks 1 exhausted
    - 503, 503, 200 → succeeds after 2 sleeps of 700
    - 400 with `API_KEY_INVALID` → `Kind.BAD_KEY`
    - all 429 → `Kind.QUOTA`
    - an `IOException` from http → `Kind.NETWORK`
    - text is joined from `candidates[0].content.parts[*].text`
  - `NoteStoreTest`:
    - `queueSurvivesReload`: add 3, create a new `NoteStore` on the same store → 3 queued
    - 25 sent + 2 queued → `recent()` has 22 and both queued are present
    - `markSent` moves a note out of `queued()`
    - `delete` removes it
- [ ] **Step 2:** `./gradlew testDebugUnitTest` → FAIL (classes missing).
- [ ] **Step 3:** Implement each file to the interfaces above.
- [ ] **Step 4:** `./gradlew testDebugUnitTest` → all PASS.
- [ ] **Step 5:** Commit: `feat(android): core logic - modes, wake word, preview, usage, Gemini, queue`.

### Task 7: Floating orb bubble with tap-to-talk

**Files:**
- Create under `.../voiceorb/`: `orb/OrbController.kt` (pure state machine), `orb/OrbView.kt`, `orb/BubbleService.kt`, `platform/Prefs.kt` (`KeyValueStore` over `SharedPreferences("voiceorb", MODE_PRIVATE)`), `platform/AndroidHttp.kt`, `platform/Voice.kt` (TTS + chime), test `orb/OrbControllerTest.kt`
- Modify: `AndroidManifest.xml`. Add the permissions `SYSTEM_ALERT_WINDOW`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MICROPHONE`, `POST_NOTIFICATIONS`, `INTERNET`, `WAKE_LOCK`. Declare `BubbleService` with `foregroundServiceType="microphone"`.

**Interfaces:**
- `enum class OrbState { OFF, WAITING_WAKE, CHOOSING, RECORDING, THINKING, SPEAKING }`
- `interface Listener { fun start(); fun stop() }` (wraps `ListenLoop` with the Task 5 strategy). `interface Speaker { fun chime(); fun say(text: String, onDone: () -> Unit) }`. `interface Clipboard { fun copy(text: String) }`. `interface Summarizer { fun summarize(raw: String, instruction: String, done: (Result<String>) -> Unit) }` (runs `GeminiClient` on a background executor and posts `done` to the main thread). `interface Timer { fun after(ms: Long, block: () -> Unit): Cancellable }`.
- `class OrbController(modes: ModeSet, notes: NoteStore, listener: Listener, speaker: Speaker, clipboard: Clipboard, summarizer: Summarizer, timer: Timer, onState: (OrbState) -> Unit)`
  - Input events: `tap()`, `onPartial(text)`, `onFinal(text)`, `setHandsFree(on: Boolean)`
  - `val state: OrbState`
- Tap-to-talk flow (hands-free off):
  - `OFF` + tap → `CHOOSING`; it says "What are we doing?" and then listens. A spoken mode → `RECORDING` ("Go ahead").
  - Speech appends to the note. **2500 ms** with no partial/final while RECORDING → send (the same value as `AUTO_SEND_MS`). Tap while RECORDING also sends.
  - Sending: `THINKING` → on success, `notes.add`, `clipboard.copy(output)`, chime, then say `SpokenPreview.of(...) + ". Copied."` → `OFF`.
  - Tap while CHOOSING → `OFF`.
- `OrbView`: a ~64dp circle drawn on `Canvas` with a radial gradient whose colours follow the state (idle blue, listening green pulse, thinking purple sparks, speaking soft white pulse). It redraws via `postInvalidateDelayed`: 33 ms while active, none while `OFF`. It can be dragged, snaps to the nearest side edge on release, and a tap is a touch with < 10 px movement.
- `BubbleService`: starts in the foreground with a low-importance notification ("Voice Orb is ready - tap the orb to talk"; action "Turn off"). It adds `OrbView` via `WindowManager` (`TYPE_APPLICATION_OVERLAY`, `FLAG_NOT_FOCUSABLE`), wires the real implementations into `OrbController`, and removes everything in `onDestroy`. The Gemini key comes from `Prefs` key `geminiKey`.
- `Voice`: `TextToSpeech` with `AudioAttributes.USAGE_ASSISTANT` / `CONTENT_TYPE_SPEECH` (goes to car Bluetooth). It requests transient audio focus with ducking while speaking. The chime is two short `ToneGenerator` beeps on `STREAM_MUSIC`, or a generated `AudioTrack` tone (builder's choice).

- [ ] **Step 1: Write failing `OrbControllerTest`** with fakes that record calls and a manual `Timer`:
  - `tapAsksForModeThenRecords`
  - `pauseOf2500msSendsAndCopies`: after send success → the clipboard has the output, `notes.queued()` has 1, the speaker said the preview + "Copied.", state `OFF`
  - `tapWhileRecordingSendsImmediately`
  - `speakingPausesListening`: `listener.stop()` is called before `speaker.chime()`/`say`, and `start()` is not called again until `onDone` (when hands-free is on; in tap mode never)
  - `geminiFailureKeepsRawNoteAndRearms`: on `Result.failure(GeminiException(kind=NETWORK))` → it says "No connection - I saved your note for later.", the note is stored with empty output and QUEUED, state `OFF` (or `WAITING_WAKE` in hands-free)
  - `badKeySaysOpenTheApp`: `BAD_KEY` → it says "Google rejected the key - open Voice Orb to fix it."
- [ ] **Step 2:** `./gradlew testDebugUnitTest` → FAIL.
- [ ] **Step 3:** Implement `OrbController` (tap mode only), then the Android shells. For now, start the service from a temporary button in `MainActivity`.
- [ ] **Step 4:** `./gradlew testDebugUnitTest assembleRelease` → PASS / BUILD SUCCESSFUL.
- [ ] **Step 5:** Commit: `feat(android): floating orb bubble with tap-to-talk`.

### Task 8: Hands-free "Hey Orb"

**Files:**
- Modify: `orb/OrbController.kt`, `orb/OrbControllerTest.kt`, `orb/BubbleService.kt`, `orb/OrbView.kt`

**Behaviour (added to `OrbController`):**
- `setHandsFree(true)` while `OFF`, then tap → `WAITING_WAKE` with the listener running.
- In `WAITING_WAKE`, each final goes through `WakeWord.match`; a miss is ignored.
- After the wake word, the rest goes through `Commands.parse`:
  - `ReadAgain` → say the latest note's full output.
  - `Cancel` → say "Okay." and stay waiting.
  - `Note(text)` → if `modes.matchSpoken(first 3 words)` finds a mode, record with the text after the mode word as the start of the note. Otherwise say "What are we doing?" → `CHOOSING`. If the wake word stands alone, also go to `CHOOSING`.
- Sending is the same as tap mode, but it ends in `WAITING_WAKE` (after TTS `onDone`, the listener restarts) instead of `OFF`.
- After sending in hands-free, the preview line is followed by "Say 'Hey Orb, read it again' for the rest."
- Tap in any hands-free state → stop everything and return to `OFF`.
- `BubbleService` sets `FLAG_KEEP_SCREEN_ON` on the overlay window while the state is not `OFF`.

- [ ] **Step 1: Write failing tests:**
  - `wakeThenModeThenNoteSends`: final `"hey orb summary pick up milk"`, then a 2500 ms timer → summarizer gets raw `"pick up milk"` with the summary instruction
  - `wakeAloneAsksForMode`
  - `speechWithoutWakeIsIgnored`
  - `readAgainSpeaksFullLatest`
  - `cancelKeepsWaiting`
  - `afterReplyListeningResumesOnlyWhenSpeechDone` (extends `speakingPausesListening` for hands-free)
  - `geminiFailureKeepsRawNoteAndRearms` hands-free variant → `WAITING_WAKE`
  - `tapStopsHandsFree`
- [ ] **Step 2:** `./gradlew testDebugUnitTest` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `./gradlew testDebugUnitTest assembleRelease` → PASS.
- [ ] **Step 5:** Commit: `feat(android): hands-free Hey Orb mode`.

### Task 9: Main screen: key, switches, permissions, queue

**Files:**
- Replace `MainActivity.kt` (remove the Task 5 spike UI and the Task 7 temp button). Create `ui/PermissionCheck.kt` + test, and `res/layout/activity_main.xml` (or build views in code; builder's choice). The dark theme matches the web colours (`#0e1424` background, `#4da3ff` accent).

**Interfaces:**
- `data class Granted(val mic: Boolean, val overlay: Boolean, val notifications: Boolean)` and `object PermissionCheck { fun missing(g: Granted): List<String> }`. It returns plain sentences in this order:
  - "Allow the microphone so Voice Orb can hear you."
  - "Allow 'Display over other apps' so the orb can float over Claude."
  - "Allow notifications so Android keeps the orb running."

**Screen, top to bottom:**
1. Gemini key field: password style, with a Save button. Saved state shows "Key saved (ends in …abcd)", Change and Forget. It also has the same link and privacy line as the web setup sheet.
2. The "Show the floating orb" switch starts/stops `BubbleService`. If permissions are missing, list them, with a button per item that opens the right settings screen or permission prompt.
3. The "Hands-free (Hey Orb)" switch, saved in `Prefs` as `handsFree` and read by the service.
4. "Waiting for Claude (N)": each queued note shows the mode label and a 2-line preview of the output (or "Not written yet - no connection" when the output is empty), with the buttons:
   - **Send to Claude**: `Intent.createChooser(ACTION_SEND text/plain)`, then mark it sent
   - **Copy**
   - **Delete**
   - **Write it now**: only shown when the output is empty; it reruns Gemini
5. "Recent": sent notes, tap to copy.
6. The usage line, like the web's.

- [ ] **Step 1: Write failing `PermissionCheckTest`**: all granted → empty; none → the 3 sentences in order.
- [ ] **Step 2:** FAIL → implement → PASS.
- [ ] **Step 3:** Implement the screen. Run `./gradlew testDebugUnitTest assembleRelease` → PASS.
- [ ] **Step 4:** Commit: `feat(android): main screen with key, switches and Claude queue`.

### Task 10: Ship it: APK, checklist, README

**Files:**
- Create: `docs/phone-checklist.md`
- Modify: `README.md` (an "Android app (floating orb)" section: download, install from file, permissions, how to use while driving, Send to Claude), `docs/android-build.md`

- [ ] **Step 1:** Write `docs/phone-checklist.md` as plain numbered checks with a ✅/❌ column, covering spec §F in full: web app, Android install, permissions, bubble over Claude, tap-to-talk, hands-free in a quiet room, in the car over Bluetooth, no constant beeping, chime + read-aloud, no self-hearing, the queue after parking, airplane mode → the note is saved, and app restart → the queue is still there.
- [ ] **Step 2:** Build the signed release (`versionCode 1`, `versionName "1.0"`). Ask the owner whether to publish it as a GitHub Release on `BENEVOLENT69/voice-orb-phone` (public download link) or to keep using USB. Do it after their yes, and link it in the README.
- [ ] **Step 3:** `npm test` and `./gradlew testDebugUnitTest` → all pass. Commit: `docs: Android app install guide and phone checklist`, and push.
- [ ] **Step 4:** Send the owner the install steps and the checklist, then fix what comes back. Each fix gets a failing test first where the logic is testable. Bump `versionCode` for each new APK.
