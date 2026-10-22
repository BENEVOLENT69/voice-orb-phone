const test = require('node:test');
const assert = require('node:assert');
const { UsageTracker, quotaDay } = require('../js/usage');

function memoryStore() {
  const data = {};
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => (data[k] = String(v)) };
}

test('quotaDay uses Pacific time, when Gemini free quotas reset', () => {
  // 05:00 UTC on Oct 23 is still Oct 22 in California.
  assert.strictEqual(quotaDay(new Date('2026-10-23T05:00:00Z')), '2026-10-22');
  assert.strictEqual(quotaDay(new Date('2026-10-23T08:00:00Z')), '2026-10-23');
});

test('counts requests per model and reports percent used and requests left', () => {
  const now = new Date('2026-10-22T18:00:00Z');
  const u = new UsageTracker({ store: memoryStore(), dailyLimit: 20, now: () => now });
  u.record('gemini-3.5-flash');
  u.record('gemini-3.5-flash');
  u.record('gemini-3.5-flash');
  assert.deepStrictEqual(u.model('gemini-3.5-flash'), { used: 3, limit: 20, left: 17, percent: 15 });
});

test('a quota error marks the model as fully used for today', () => {
  const now = new Date('2026-10-22T18:00:00Z');
  const u = new UsageTracker({ store: memoryStore(), dailyLimit: 20, now: () => now });
  u.record('a');
  u.markExhausted('a');
  assert.deepStrictEqual(u.model('a'), { used: 20, limit: 20, left: 0, percent: 100 });
});

test('totals across several models add up their separate daily limits', () => {
  const now = new Date('2026-10-22T18:00:00Z');
  const u = new UsageTracker({ store: memoryStore(), dailyLimit: 20, now: () => now });
  u.record('a');
  u.markExhausted('b');
  assert.deepStrictEqual(u.total(['a', 'b', 'c']), { used: 21, limit: 60, left: 39, percent: 35 });
});

test('counts start fresh on a new quota day and survive a restart', () => {
  const store = memoryStore();
  let now = new Date('2026-10-22T18:00:00Z');
  new UsageTracker({ store, dailyLimit: 20, now: () => now }).record('a');
  assert.strictEqual(new UsageTracker({ store, dailyLimit: 20, now: () => now }).model('a').used, 1, 'kept after restart');
  now = new Date('2026-10-23T18:00:00Z');
  assert.strictEqual(new UsageTracker({ store, dailyLimit: 20, now: () => now }).model('a').used, 0, 'reset next day');
});

test('works without any storage (private window, blocked storage)', () => {
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  const u = new UsageTracker({ store: broken, dailyLimit: 20 });
  u.record('a');
  assert.strictEqual(u.model('a').used, 1);
});
