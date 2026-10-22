// Daily request meter for the Gemini free tier. Google does not report remaining quota, so the app
// counts its own requests per model per "quota day" (quotas reset at midnight Pacific time).
// Requests made outside this app on the same key are not counted; a quota error corrects the
// count to "fully used".

const STORAGE_KEY = 'geminiUsage';

function quotaDay(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(date);
}

function summarise(used, limit) {
  const capped = Math.min(used, limit);
  return { used: capped, limit, left: limit - capped, percent: Math.round((capped / limit) * 100) };
}

class UsageTracker {
  constructor({ store, dailyLimit = 20, now = () => new Date() } = {}) {
    this.store = store;
    this.dailyLimit = dailyLimit;
    this.now = now;
    this.data = this.load();
  }

  load() {
    const today = quotaDay(this.now());
    try {
      const saved = JSON.parse(this.store.getItem(STORAGE_KEY));
      if (saved && saved.day === today) return saved;
    } catch (_) {}
    return { day: today, counts: {} };
  }

  save() {
    try {
      this.store.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch (_) {}
  }

  // Starts a new day's counts once midnight Pacific has passed.
  roll() {
    const today = quotaDay(this.now());
    if (this.data.day !== today) this.data = { day: today, counts: {} };
  }

  record(model) {
    this.roll();
    this.data.counts[model] = (this.data.counts[model] || 0) + 1;
    this.save();
  }

  markExhausted(model) {
    this.roll();
    this.data.counts[model] = this.dailyLimit;
    this.save();
  }

  model(model) {
    this.roll();
    return summarise(this.data.counts[model] || 0, this.dailyLimit);
  }

  total(models) {
    this.roll();
    const used = models.reduce((sum, m) => sum + Math.min(this.data.counts[m] || 0, this.dailyLimit), 0);
    return summarise(used, this.dailyLimit * models.length);
  }
}

const usageApi = { UsageTracker, quotaDay };
if (typeof module !== 'undefined' && module.exports) module.exports = usageApi;
if (typeof window !== 'undefined') window.GeminiUsage = usageApi;
