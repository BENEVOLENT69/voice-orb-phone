const test = require('node:test');
const assert = require('node:assert');
const { sendToClaude, setupInstall } = require('../js/share');

function copier() {
  const copied = [];
  return { copied, copy: async (t) => copied.push(t) };
}

test('shares when the share sheet exists', async () => {
  const shared = [];
  const c = copier();
  const result = await sendToClaude('ROLE: expert', { nav: { share: async (d) => shared.push(d.text) }, copy: c.copy });
  assert.strictEqual(result, 'shared');
  assert.deepStrictEqual(shared, ['ROLE: expert']);
  assert.deepStrictEqual(c.copied, []);
});

test('falls back to copy when share is missing or fails', async () => {
  const missing = copier();
  assert.strictEqual(await sendToClaude('a', { nav: {}, copy: missing.copy }), 'copied');
  assert.deepStrictEqual(missing.copied, ['a']);

  const failing = copier();
  const nav = { share: async () => { throw Object.assign(new Error('nope'), { name: 'NotAllowedError' }); } };
  assert.strictEqual(await sendToClaude('b', { nav, copy: failing.copy }), 'copied');
  assert.deepStrictEqual(failing.copied, ['b']);
});

test('cancel is not a copy', async () => {
  const c = copier();
  const nav = { share: async () => { throw Object.assign(new Error('cancel'), { name: 'AbortError' }); } };
  assert.strictEqual(await sendToClaude('x', { nav, copy: c.copy }), 'cancelled');
  assert.deepStrictEqual(c.copied, []);
});

test('empty text does nothing', async () => {
  const c = copier();
  const shared = [];
  assert.strictEqual(await sendToClaude('   ', { nav: { share: async (d) => shared.push(d) }, copy: c.copy }), 'empty');
  assert.deepStrictEqual([shared, c.copied], [[], []]);
});

// A window that records listeners so the test can fire Chrome's install events.
function fakeWin(standalone = false) {
  const listeners = {};
  return {
    addEventListener: (type, fn) => (listeners[type] = fn),
    fire: (type, e = {}) => listeners[type] && listeners[type](e),
    matchMedia: () => ({ matches: standalone }),
  };
}

test('install button appears only after Chrome offers it, and hides once installed', async () => {
  const win = fakeWin();
  const button = { hidden: true };
  setupInstall({ win, button });
  assert.strictEqual(button.hidden, true);

  let prevented = false;
  let prompted = false;
  win.fire('beforeinstallprompt', { preventDefault: () => (prevented = true), prompt: async () => (prompted = true) });
  assert.strictEqual(prevented, true);
  assert.strictEqual(button.hidden, false);

  await button.onclick();
  assert.strictEqual(prompted, true);
  assert.strictEqual(button.hidden, true);

  button.hidden = false;
  win.fire('appinstalled');
  assert.strictEqual(button.hidden, true);
});

test('install button never shows when already installed', () => {
  const win = fakeWin(true);
  const button = { hidden: true };
  setupInstall({ win, button });
  win.fire('beforeinstallprompt', { preventDefault: () => {}, prompt: async () => {} });
  assert.strictEqual(button.hidden, true);
});
