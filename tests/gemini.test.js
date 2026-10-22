const test = require('node:test');
const assert = require('node:assert');
const { GeminiProvider, buildSummaryPrompt, floatTo16BitPCM, int16ToBase64 } = require('../js/gemini');

class FakeWS {
  constructor(url) {
    this.url = url;
    this.sent = [];
    FakeWS.last = this;
  }
  send(d) {
    this.sent.push(JSON.parse(d));
  }
  close() {}
}

test('buildSummaryPrompt embeds the transcript and section names', () => {
  const p = buildSummaryPrompt('hello world');
  assert.match(p, /GOAL:/);
  assert.match(p, /NEXT STEPS:/);
  assert.ok(p.endsWith('hello world'));
});

test('floatTo16BitPCM clamps and scales', () => {
  const out = floatTo16BitPCM(new Float32Array([0, 1, -1, 2]));
  assert.deepStrictEqual(Array.from(out), [0, 32767, -32768, 32767]);
});

test('int16ToBase64 round-trips', () => {
  const src = new Int16Array([1, -2, 300]);
  const bytes = Uint8Array.from(Buffer.from(int16ToBase64(src), 'base64'));
  const back = new Int16Array(bytes.buffer);
  assert.deepStrictEqual(Array.from(back), [1, -2, 300]);
});

test('connectTranscribe sends setup, queues audio until ready, routes transcripts', async () => {
  const events = [];
  const p = new GeminiProvider({ apiKey: 'k', WebSocketImpl: FakeWS });
  const session = p.connectTranscribe({
    onInterim: (t) => events.push(['interim', t]),
    onFinal: (t) => events.push(['final', t]),
    onReady: () => events.push(['ready']),
  });
  const ws = FakeWS.last;
  assert.match(ws.url, /key=k$/);
  ws.onopen();
  assert.strictEqual(ws.sent[0].setup.model, 'models/gemini-3.5-transcribe-live');

  session.sendAudio(new Int16Array([1, 2]));
  assert.strictEqual(ws.sent.length, 1, 'audio is queued before setupComplete');

  await ws.onmessage({ data: JSON.stringify({ setupComplete: {} }) });
  assert.strictEqual(ws.sent.length, 2);
  assert.strictEqual(ws.sent[1].realtimeInput.audio.mimeType, 'audio/pcm;rate=16000');

  await ws.onmessage({ data: JSON.stringify({ serverContent: { interimInputTranscription: { text: 'hel' } } }) });
  await ws.onmessage({ data: JSON.stringify({ serverContent: { inputTranscription: { text: 'hello' } } }) });
  assert.deepStrictEqual(events, [['ready'], ['interim', 'hel'], ['final', 'hello']]);
});

test('summarize posts the prompt and joins response parts', async () => {
  let call;
  const fetchImpl = async (url, opts) => {
    call = { url, opts };
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'A' }, { text: 'B' }] } }] }) };
  };
  const p = new GeminiProvider({ apiKey: 'k', fetchImpl });
  assert.strictEqual(await p.summarize('raw'), 'AB');
  assert.match(call.url, /gemini-3\.5-flash:generateContent$/);
  assert.strictEqual(call.opts.headers['x-goog-api-key'], 'k');
});

test('summarize retries a transient 503 then succeeds', async () => {
  let n = 0;
  const fetchImpl = async () =>
    ++n < 3
      ? { ok: false, status: 503, text: async () => 'busy' }
      : { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }) };
  const p = new GeminiProvider({ apiKey: 'k', fetchImpl });
  p.retryDelayMs = 0;
  assert.strictEqual(await p.summarize('x'), 'ok');
  assert.strictEqual(n, 3);
});

const quotaBody = JSON.stringify({ error: { code: 429, message: 'You exceeded your current quota, please check your plan.' } });

test('summarize falls back to the next model when one hits its daily quota, and skips it afterwards', async () => {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    return /model-a:/.test(url)
      ? { ok: false, status: 429, text: async () => quotaBody }
      : { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'from b' }] } }] }) };
  };
  const p = new GeminiProvider({ apiKey: 'k', fetchImpl, summaryModels: ['model-a', 'model-b'] });
  assert.strictEqual(await p.summarize('x'), 'from b');
  assert.strictEqual(p.lastModel, 'model-b');
  urls.length = 0;
  await p.summarize('y');
  assert.deepStrictEqual(urls.map((u) => u.match(/models\/([^:]+)/)[1]), ['model-b'], 'exhausted model is skipped');
});

test('when every model is out of quota the error is one readable sentence, not raw JSON', async () => {
  const fetchImpl = async () => ({ ok: false, status: 429, text: async () => quotaBody });
  const p = new GeminiProvider({ apiKey: 'k', fetchImpl, summaryModels: ['a', 'b'] });
  await assert.rejects(
    () => p.summarize('x'),
    (e) => /free daily limit/i.test(e.message) && !/[{}]/.test(e.message)
  );
});

test('summarize reports each request and quota hit to the usage meter, and skips models it says are used up', async () => {
  const log = [];
  const usage = {
    record: (m) => log.push(['record', m]),
    markExhausted: (m) => log.push(['exhausted', m]),
    model: (m) => ({ left: m === 'model-z' ? 0 : 5 }),
  };
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    return /model-a:/.test(url)
      ? { ok: false, status: 429, text: async () => quotaBody }
      : { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }) };
  };
  const p = new GeminiProvider({ apiKey: 'k', fetchImpl, usage, summaryModels: ['model-z', 'model-a', 'model-b'] });
  await p.summarize('x');
  assert.ok(!urls.some((u) => /model-z:/.test(u)), 'model the meter says is used up is never called');
  assert.deepStrictEqual(log, [['exhausted', 'model-a'], ['record', 'model-b']]);
});

test('summarize surfaces HTTP errors', async () => {
  const fetchImpl = async () => ({ ok: false, status: 403, text: async () => 'denied' });
  const p = new GeminiProvider({ apiKey: 'k', fetchImpl });
  await assert.rejects(() => p.summarize('x'), /403/);
});

test('missing key fails fast', () => {
  const p = new GeminiProvider({ WebSocketImpl: FakeWS });
  assert.throws(() => p.connectTranscribe(), /GEMINI_API_KEY/);
});
