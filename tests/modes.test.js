const test = require('node:test');
const assert = require('node:assert');
const { MODES, matchSpokenMode } = require('../js/modes');
const { buildSummaryPrompt } = require('../js/gemini');

test('there are four default modes with unique ids', () => {
  assert.strictEqual(MODES.length, 4);
  assert.strictEqual(new Set(MODES.map((m) => m.id)).size, 4);
});

test('spoken numbers and names pick the right mode', () => {
  assert.strictEqual(matchSpokenMode('One.').id, 'prompt');
  assert.strictEqual(matchSpokenMode('number two please').id, 'feedback');
  assert.strictEqual(matchSpokenMode('just summarise it').id, 'summary');
  assert.strictEqual(matchSpokenMode('condense my intent').id, 'condense');
  assert.strictEqual(matchSpokenMode('um hello there'), null);
});

test('buildSummaryPrompt uses the chosen mode instruction and keeps the transcript last', () => {
  const m = MODES.find((x) => x.id === 'condense');
  const p = buildSummaryPrompt('raw words', m.instruction);
  assert.match(p, /shortest version/);
  assert.ok(p.endsWith('raw words'));
});
