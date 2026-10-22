// Loads the scripts into one shared global scope, the way index.html does, to catch top-level
// name clashes that per-file require() can't see.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

test('page scripts load together in one global scope', () => {
  const ctx = vm.createContext({});
  ctx.window = ctx;
  for (const file of ['js/modes.js', 'js/usage.js', 'js/gemini.js', 'js/speech.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), ctx, { filename: file });
  }
  assert.ok(ctx.VoiceModes && ctx.VoiceModes.MODES.length === 4);
  assert.ok(ctx.GeminiUsage && typeof ctx.GeminiUsage.UsageTracker === 'function');
  assert.ok(ctx.GeminiProviderApi && typeof ctx.GeminiProviderApi.GeminiProvider === 'function');
  assert.ok(ctx.VoiceSpeech && typeof ctx.VoiceSpeech.createListener === 'function');
});

test('the service worker caches every file the page loads', () => {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const loaded = [...html.matchAll(/(?:src|href)="([^"#:]+)"/g)].map((m) => m[1]);
  for (const f of loaded) assert.ok(sw.includes(`'${f}'`), `sw.js should cache ${f}`);
  for (const f of loaded) assert.ok(fs.existsSync(path.join(root, f)), `${f} exists`);
});
