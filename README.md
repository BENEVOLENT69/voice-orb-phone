# Voice Orb: phone version

Speak into your phone and get your words back as an **expert prompt**, **chat feedback**, a
**high-level summary**, or your **condensed intent**. Raw text appears live as you talk, the result
appears when you pause, and both copy as plain text with one tap.

It's a web app you install to your home screen. No app store is needed, and it's free.

## Install on an Android phone

1. Open the app's link in **Chrome** on your phone.
2. Paste your **Gemini API key**. Get a free one at <https://aistudio.google.com/apikey>.
3. Tap Chrome's **⋮** menu, then **Add to Home screen**. It now opens full-screen from its own icon.
4. Tap the orb and allow the microphone.

## Your key and your privacy

- **Your key stays on your phone.** It's saved only in this browser on this device and is sent
  only to Google. There is no Voice Orb server, so nobody else ever sees it.
- **Speech-to-text runs in Chrome,** using Chrome's built-in recogniser. It doesn't use your Gemini
  quota. Gemini is only called to write the result.
- **Lock down your key in Google's settings:** limit it to the Gemini API and set a usage cap.
- **To remove the key,** go to Settings (gear icon), then **Forget key on this phone**.

## Using it

- **Start or pause:** tap the orb. The first time, it asks "What are we doing?". Say a number or
  a name, or tap one of the four modes.
- **Pause:** gives you the result. Tap the orb again to keep adding. Edits you make in Raw are kept.
- **Send when I pause:** stops listening and produces the result as soon as you stop talking.
- **History:** your last 5 notes appear as chips. **Pin** up to 4 to keep them.
- **Usage line:** counts today's free Gemini requests on this phone. Limits reset at midnight
  Pacific time. When one model's free limit runs out, it switches to the next free model.

## Limits

- Live speech-to-text needs **Chrome on Android**. On iPhone, or in browsers without speech
  recognition, you can still type or paste into Raw and pick a mode.
- The microphone only works over **https**, so use the hosted link rather than opening the file
  directly.

## Develop

```bash
npm test
```

```bash
npm run serve
```

`npm run serve` starts a server at http://localhost:8080. It has no dependencies; the modes, Gemini
provider, usage meter, orb and bear are shared with the desktop app.
