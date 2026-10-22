// Gemini provider: live transcription (Live API over WebSocket) and summary (generateContent).
// Works in the Electron renderer (global WebSocket/fetch) and under node --test (injected fakes).

const WS_BASE =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
const REST_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_SUMMARY_MODELS = ['gemini-3.5-flash', 'gemini-flash-lite-latest', 'gemini-3.5-flash-lite'];

// Pulls the human message out of a Gemini error body so the UI never shows raw JSON.
function readableError(text) {
  let msg = text;
  try {
    msg = JSON.parse(text).error.message || text;
  } catch (_) {}
  msg = String(msg).split('\n')[0].replace(/[{}"]/g, '').trim();
  return msg.length > 140 ? msg.slice(0, 140) + '...' : msg;
}

const Modes = typeof require === 'function' ? require('./modes') : window.VoiceModes;

// `instruction` comes from a mode in modes.js; it defaults to the high-level summary.
function buildSummaryPrompt(rawText, instruction = Modes.SUMMARY_INSTRUCTION) {
  return [
    'You are a voice-note assistant. The text below is a raw speech transcript.',
    instruction,
    '',
    'Transcript:',
    rawText,
  ].join('\n');
}

function floatTo16BitPCM(float32) {
  const out = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function int16ToBase64(int16) {
  const bytes = new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return typeof btoa === 'function' ? btoa(bin) : Buffer.from(bin, 'binary').toString('base64');
}

class GeminiProvider {
  constructor({ apiKey, summaryModel, summaryModels, transcribeModel, WebSocketImpl, fetchImpl, usage } = {}) {
    this.apiKey = apiKey;
    this.usage = usage; // optional daily request meter (usage.js)
    this.totalTokens = 0; // running Gemini token use for summaries, shown in the footer
    // Preferred model first, then free fallbacks with their own separate daily quotas.
    const preferred = summaryModels || [summaryModel || DEFAULT_SUMMARY_MODELS[0], ...DEFAULT_SUMMARY_MODELS];
    this.summaryModels = [...new Set(preferred)];
    this.exhausted = new Set();
    this.lastModel = null;
    this.transcribeModel = transcribeModel || 'gemini-3.5-transcribe-live';
    this.WebSocketImpl = WebSocketImpl || (typeof WebSocket !== 'undefined' ? WebSocket : null);
    this.fetchImpl = fetchImpl || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
  }

  // Opens a live transcription session. Callbacks: onInterim(text), onFinal(text), onError(err), onClose().
  connectTranscribe({ onInterim = () => {}, onFinal = () => {}, onError = () => {}, onClose = () => {}, onReady = () => {} } = {}) {
    if (!this.apiKey) throw new Error('Missing GEMINI_API_KEY');
    const ws = new this.WebSocketImpl(`${WS_BASE}?key=${this.apiKey}`);
    let ready = false;
    const queue = [];

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          setup: {
            model: `models/${this.transcribeModel}`,
            generationConfig: { responseModalities: ['TEXT'] },
            inputAudioTranscription: { languageCodes: [] },
          },
        })
      );
    };

    ws.onmessage = async (event) => {
      let raw = event.data;
      if (typeof raw !== 'string' && raw && typeof raw.text === 'function') raw = await raw.text();
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch (e) {
        return onError(e);
      }
      if (msg.setupComplete !== undefined && !ready) {
        ready = true;
        queue.splice(0).forEach((m) => ws.send(m));
        return onReady();
      }
      const content = msg.serverContent;
      if (!content) return;
      if (content.interimInputTranscription?.text) onInterim(content.interimInputTranscription.text);
      if (content.inputTranscription?.text) onFinal(content.inputTranscription.text);
    };

    ws.onerror = (e) => onError(e.error || new Error('WebSocket error'));
    ws.onclose = () => onClose();

    const send = (obj) => {
      const data = JSON.stringify(obj);
      if (ready) ws.send(data);
      else queue.push(data);
    };

    return {
      sendAudio(int16) {
        send({ realtimeInput: { audio: { data: int16ToBase64(int16), mimeType: 'audio/pcm;rate=16000' } } });
      },
      end() {
        send({ realtimeInput: { audioStreamEnd: true } });
      },
      close() {
        ws.close();
      },
    };
  }

  // Tries each summary model in turn. The free tier caps requests per model per day, so a 429
  // marks that model used up for this session and the next one takes over.
  async summarize(rawText, instruction) {
    if (!this.apiKey) throw new Error('Missing GEMINI_API_KEY');
    const body = JSON.stringify({ contents: [{ parts: [{ text: buildSummaryPrompt(rawText, instruction) }] }] });
    const request = (model) =>
      this.fetchImpl(`${REST_BASE}/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
        body,
      });

    const available = (m) => !this.exhausted.has(m) && !(this.usage && this.usage.model(m).left === 0);
    for (const model of this.summaryModels.filter(available)) {
      let res = await request(model);
      // 503 means "busy right now": retry the same model briefly.
      for (let i = 0; i < 2 && res.status === 503; i++) {
        await new Promise((r) => setTimeout(r, this.retryDelayMs ?? 700));
        res = await request(model);
      }
      if (res.status === 429) {
        this.exhausted.add(model);
        if (this.usage) this.usage.markExhausted(model);
        continue;
      }
      if (!res.ok) throw new Error(`Gemini error ${res.status}: ${readableError(await res.text())}`);
      if (this.usage) this.usage.record(model);
      this.lastModel = model;
      return this.readSummary(await res.json());
    }
    throw new Error("Gemini's free daily limit is used up on every model - try again tomorrow, or enable billing on the key");
  }

  readSummary(json) {
    this.totalTokens += json.usageMetadata?.totalTokenCount || 0;
    return (json.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
  }
}

const geminiProviderApi = { GeminiProvider, buildSummaryPrompt, floatTo16BitPCM, int16ToBase64 };
if (typeof module !== 'undefined' && module.exports) module.exports = geminiProviderApi;
if (typeof window !== 'undefined') window.GeminiProviderApi = geminiProviderApi;
