// Live speech-to-text using the browser's built-in recogniser (free on Android Chrome; it uses no
// Gemini quota). Android ends a recognition session after each pause, so this restarts it for as
// long as we want to listen, and works one phrase per session (continuous mode repeats text there).
// Callbacks: onInterim(text), onFinal(text), onError(code), onActivity() (any sound of speech).

function speechSupported(win = typeof window !== 'undefined' ? window : {}) {
  return Boolean(win.SpeechRecognition || win.webkitSpeechRecognition);
}

function createListener({ Recognition, lang, onInterim = () => {}, onFinal = () => {}, onError = () => {}, onActivity = () => {} }) {
  let wanted = false;
  let rec = null;

  function startSession() {
    rec = new Recognition();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = lang;
    rec.onresult = (e) => {
      onActivity();
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const text = (r[0] && r[0].transcript ? r[0].transcript : '').trim();
        if (!text) continue;
        if (r.isFinal) onFinal(text);
        else interim += (interim ? ' ' : '') + text;
      }
      if (interim) onInterim(interim);
    };
    rec.onerror = (e) => {
      // "no-speech" and "aborted" are normal between phrases; anything else is worth reporting.
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') wanted = false;
      onError(e.error);
    };
    rec.onend = () => {
      if (wanted) {
        try {
          startSession();
        } catch (_) {
          wanted = false;
          onError('restart-failed');
        }
      }
    };
    rec.start();
  }

  return {
    start() {
      if (wanted) return;
      wanted = true;
      startSession();
    },
    stop() {
      wanted = false;
      if (rec) rec.stop();
    },
    get listening() {
      return wanted;
    },
  };
}

const speechApi = { speechSupported, createListener };
if (typeof module !== 'undefined' && module.exports) module.exports = speechApi;
if (typeof window !== 'undefined') window.VoiceSpeech = speechApi;
