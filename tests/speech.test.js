const test = require('node:test');
const assert = require('node:assert');
const { createListener, speechSupported } = require('../js/speech');

// A stand-in for the browser's SpeechRecognition that records what the listener does.
class FakeRec {
  constructor() {
    FakeRec.made.push(this);
    this.started = 0;
    this.stopped = 0;
  }
  start() {
    this.started++;
  }
  stop() {
    this.stopped++;
    this.onend && this.onend();
  }
  // helpers to simulate events
  result(items, resultIndex = 0) {
    const results = items.map(([text, isFinal]) => Object.assign([{ transcript: text }], { isFinal }));
    this.onresult({ resultIndex, results });
  }
}
FakeRec.made = [];

function make(events) {
  FakeRec.made = [];
  return createListener({
    Recognition: FakeRec,
    lang: 'en-US',
    onInterim: (t) => events.push(['interim', t]),
    onFinal: (t) => events.push(['final', t]),
    onError: (c) => events.push(['error', c]),
  });
}

test('speechSupported checks for either the standard or webkit recogniser', () => {
  assert.strictEqual(speechSupported({}), false);
  assert.strictEqual(speechSupported({ webkitSpeechRecognition: function () {} }), true);
});

test('one phrase per session, with interim and final text routed separately', () => {
  const events = [];
  make(events).start();
  const rec = FakeRec.made[0];
  assert.strictEqual(rec.continuous, false);
  assert.strictEqual(rec.interimResults, true);
  rec.result([['hello wor', false]]);
  rec.result([['hello world', true]]);
  assert.deepStrictEqual(events, [['interim', 'hello wor'], ['final', 'hello world']]);
});

test('keeps listening across Android session ends until stopped', () => {
  const events = [];
  const l = make(events);
  l.start();
  FakeRec.made[0].onend(); // Android ends the session after a pause
  assert.strictEqual(FakeRec.made.length, 2, 'a new session started');
  l.stop();
  assert.strictEqual(FakeRec.made.length, 2, 'no restart after stop');
  assert.strictEqual(l.listening, false);
});

test('normal pauses are not errors, a blocked mic is, and it stops retrying', () => {
  const events = [];
  const l = make(events);
  l.start();
  FakeRec.made[0].onerror({ error: 'no-speech' });
  assert.deepStrictEqual(events, []);
  FakeRec.made[0].onerror({ error: 'not-allowed' });
  FakeRec.made[0].onend();
  assert.deepStrictEqual(events, [['error', 'not-allowed']]);
  assert.strictEqual(FakeRec.made.length, 1, 'no restart once the mic is blocked');
});
