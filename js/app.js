(function () {
  const { GeminiProvider } = window.GeminiProviderApi;
  const { MODES, matchSpokenMode } = window.VoiceModes;
  const { UsageTracker } = window.GeminiUsage;
  const { speechSupported, createListener } = window.VoiceSpeech;
  const { sendToClaude, setupInstall } = window.VoiceShare;
  const $ = (id) => document.getElementById(id);

  const rawEl = $('raw');
  const summaryEl = $('summary');
  const statusEl = $('status');
  const modesEl = $('modes');
  const historyEl = $('history');
  const captionEl = $('caption');
  const autoSendEl = $('auto-send');

  const KEY_STORE = 'voiceOrb.geminiKey';
  const SILENCE_MS = 8000;
  const MIN_NEW_WORDS = 15;
  const AUTO_SEND_MS = 2500;
  const SPEAKING_MS = 1200;
  const MAX_HISTORY = 5;
  const MAX_PINS = 4;

  // Storage can be unavailable (private tab, blocked site data); everything still works without it.
  const store = {
    get(k) {
      try {
        return localStorage.getItem(k);
      } catch (_) {
        return null;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, v);
      } catch (_) {}
    },
    remove(k) {
      try {
        localStorage.removeItem(k);
      } catch (_) {}
    },
  };

  let usageStore = null;
  try {
    usageStore = window.localStorage;
  } catch (_) {}
  const usage = new UsageTracker({ store: usageStore, dailyLimit: 20 });
  let provider = null;

  let finalText = '';
  let interim = '';
  let recording = false;
  let paused = false;
  let choosing = false;
  let summarising = 0;
  let summarySeq = 0;
  let lastKey = '';
  let mode = null;
  let history = [];
  let currentId = null;
  let silenceTimer;
  let autoSendTimer;
  let wordsAtLastDraft = 0;
  let lastSpeechAt = 0;
  let heardThisRun = false;
  let doneUntil = 0;
  let listener = null;

  const setStatus = (s) => (statusEl.textContent = s);
  const wordCount = (s) => (s.trim() ? s.trim().split(/\s+/).length : 0);

  // ---------- key setup ----------
  function useKey(key) {
    provider = new GeminiProvider({ apiKey: key, usage });
    $('setup').hidden = true;
    $('main').hidden = false;
    $('dock').hidden = false;
    renderUsage();
  }
  function showSetup() {
    $('setup').hidden = false;
    $('main').hidden = true;
    $('dock').hidden = true;
    $('key-input').value = '';
  }
  $('key-save').onclick = () => {
    const key = $('key-input').value.trim();
    if (!key) return;
    store.set(KEY_STORE, key);
    useKey(key);
    setStatus('Key saved on this phone. Tap the orb to start.');
  };
  $('open-settings').onclick = () => {
    const key = store.get(KEY_STORE) || '';
    $('key-status').textContent = key ? `Key saved on this phone (ends in ...${key.slice(-4)}).` : 'No key saved.';
    $('usage-detail').textContent = usageLines().join('\n');
    $('settings').hidden = false;
  };
  $('settings-close').onclick = () => ($('settings').hidden = true);
  $('key-change').onclick = () => {
    $('settings').hidden = true;
    showSetup();
  };
  $('key-forget').onclick = () => {
    store.remove(KEY_STORE);
    provider = null;
    $('settings').hidden = true;
    showSetup();
  };

  // ---------- state, animation, captions ----------
  function refreshState() {
    const s = summarising ? 'thinking' : choosing ? 'choosing' : recording ? 'listening' : 'idle';
    document.body.dataset.state = s;
    window.blob.state = s;
    updateCaption();
  }
  function updateCaption() {
    const now = Date.now();
    let text = '';
    let cls = '';
    if (summarising) [text, cls] = ['Thinking…', 'thinking'];
    else if (recording && choosing) text = 'What are we doing?';
    else if (recording && !heardThisRun) [text, cls] = ['Okay, go ahead', 'go'];
    else if (recording && now - lastSpeechAt < SPEAKING_MS) text = 'Listening…';
    else if (recording) text = 'Actualizing…';
    else if (now < doneUntil) [text, cls] = ['Done ✓', 'go'];
    if (captionEl.textContent !== text) captionEl.textContent = text;
    captionEl.className = cls;
    captionEl.hidden = !text;
  }
  setInterval(() => {
    updateCaption();
    // There's no mic level to read while the recogniser has the mic, so the orb pulses on speech.
    window.blob.level = recording && Date.now() - lastSpeechAt < 400 ? 0.16 : 0.02;
  }, 200);
  function heardSpeech() {
    lastSpeechAt = Date.now();
    heardThisRun = true;
  }

  const renderRaw = () => {
    rawEl.value = (finalText + (interim ? ' ' + interim : '')).trim();
    rawEl.scrollTop = rawEl.scrollHeight;
  };

  // ---------- modes ----------
  function renderModes() {
    modesEl.replaceChildren(
      ...MODES.map((m, i) => {
        const b = document.createElement('button');
        b.className = 'mode' + (mode && mode.id === m.id ? ' active' : '');
        b.textContent = `${i + 1}. ${m.label}`;
        const small = document.createElement('small');
        small.textContent = m.hint;
        b.appendChild(small);
        b.onclick = () => selectMode(m);
        return b;
      })
    );
    document.body.toggleAttribute('data-has-mode', !!mode);
    $('out-title').textContent = mode ? mode.label : 'Output';
  }

  function selectMode(m) {
    mode = m;
    renderModes();
    if (recording && choosing) {
      choosing = false;
      finalText = '';
      interim = '';
      renderRaw();
      refreshState();
      return setStatus(`${m.label} - go ahead, I'm listening`);
    }
    if (!recording && rawEl.value.trim()) return summariseNow(`Reworking as ${m.label}...`, true);
    if (!recording) start();
  }

  // ---------- history: last 5 notes, pinned ones stay ----------
  function saveToHistory() {
    const raw = rawEl.value.trim();
    if (!raw || !mode) return;
    let entry = history.find((h) => h.id === currentId);
    if (!entry) {
      entry = { id: (currentId = Date.now()), pinned: false };
      history.unshift(entry);
    }
    Object.assign(entry, { modeId: mode.id, raw, summary: summaryEl.value });
    while (history.length > MAX_HISTORY) {
      history.splice(history.map((h) => h.pinned).lastIndexOf(false), 1);
    }
    renderHistory();
  }
  function renderHistory() {
    historyEl.replaceChildren(
      ...history.map((h) => {
        const chip = document.createElement('div');
        chip.className = 'hist' + (h.pinned ? ' pinned' : '');
        const t = document.createElement('span');
        t.className = 't';
        const m = MODES.find((x) => x.id === h.modeId);
        t.textContent = `${m ? m.label : ''}: ${h.raw}`;
        t.onclick = () => loadEntry(h);
        const pin = document.createElement('button');
        pin.textContent = h.pinned ? 'Unpin' : 'Pin';
        pin.onclick = () => {
          if (!h.pinned && history.filter((x) => x.pinned).length >= MAX_PINS) {
            return setStatus(`You can pin up to ${MAX_PINS} notes`);
          }
          h.pinned = !h.pinned;
          renderHistory();
        };
        chip.append(t, pin);
        return chip;
      })
    );
  }
  function loadEntry(h) {
    if (recording) return;
    currentId = h.id;
    mode = MODES.find((m) => m.id === h.modeId);
    finalText = h.raw;
    interim = '';
    renderRaw();
    summaryEl.value = h.summary;
    lastKey = mode.id + '\n' + h.raw;
    paused = true;
    choosing = false;
    renderModes();
    refreshState();
    setStatus('Loaded - tap the orb to keep adding');
  }

  // ---------- output, always in the background ----------
  function usageLines() {
    if (!provider) return [];
    return [
      'Free requests today (counted on this phone; resets midnight Pacific):',
      ...provider.summaryModels.map((x) => {
        const u = usage.model(x);
        return `${x}: ${u.used}/${u.limit} (${u.percent}%), ${u.left} left`;
      }),
    ];
  }
  function renderUsage() {
    if (!provider) return;
    const model = provider.lastModel || provider.summaryModels[0];
    const m = usage.model(model);
    const all = usage.total(provider.summaryModels);
    $('tokens').textContent =
      `${provider.totalTokens.toLocaleString()} tokens · ${model} ${m.used}/${m.limit} today · ` +
      `all models ${all.percent}% used, ${all.left} left`;
  }

  async function summariseNow(label, force) {
    const raw = rawEl.value.trim();
    if (!raw || !mode || !provider) return;
    const key = mode.id + '\n' + raw;
    if (key === lastKey && !force) return;
    const seq = ++summarySeq;
    setStatus(label);
    summarising++;
    refreshState();
    try {
      const text = await provider.summarize(raw, mode.instruction);
      if (seq !== summarySeq) return;
      summaryEl.value = text;
      lastKey = key;
      doneUntil = Date.now() + 2500;
      saveToHistory();
      setStatus(recording ? 'Listening... (draft updated)' : 'Draft ready');
    } catch (e) {
      if (seq !== summarySeq) return;
      if (/API key not valid|API_KEY_INVALID|PERMISSION_DENIED/i.test(e.message)) {
        setStatus('Google rejected this key - tap the gear to change it');
      } else {
        setStatus('Error: ' + e.message);
      }
    } finally {
      renderUsage();
      summarising--;
      refreshState();
    }
  }

  function armSilenceTimer() {
    clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => {
      if (!recording || choosing || wordCount(rawEl.value) - wordsAtLastDraft < MIN_NEW_WORDS) return;
      wordsAtLastDraft = wordCount(rawEl.value);
      summariseNow('Listening... (updating draft)');
    }, SILENCE_MS);
  }
  function armAutoSend() {
    clearTimeout(autoSendTimer);
    if (!autoSendEl.checked) return;
    autoSendTimer = setTimeout(() => {
      if (!recording || choosing || !rawEl.value.trim()) return;
      setStatus('Heard a pause - sending...');
      pause();
    }, AUTO_SEND_MS);
  }
  autoSendEl.checked = store.get('autoSend') === '1';
  autoSendEl.onchange = () => store.set('autoSend', autoSendEl.checked ? '1' : '0');

  // Typing in the Raw box is kept: the next words you speak are added after your edits.
  rawEl.addEventListener('input', () => {
    finalText = rawEl.value.trim();
    interim = '';
  });

  // ---------- recording ----------
  function start() {
    if (recording) return;
    if (!provider) return showSetup();
    if (!speechSupported()) {
      return setStatus("This browser can't do live speech-to-text. Open it in Chrome on Android, or type in Raw.");
    }
    if (!paused) {
      finalText = '';
      interim = '';
      renderRaw();
      summaryEl.value = '';
      lastKey = '';
      currentId = null;
      wordsAtLastDraft = 0;
    } else {
      finalText = rawEl.value.trim();
      interim = '';
    }
    choosing = !mode;
    heardThisRun = false;
    paused = false;
    setStatus(choosing ? 'What are we doing? Say 1 to 4' : 'Listening...');

    listener = createListener({
      Recognition: window.SpeechRecognition || window.webkitSpeechRecognition,
      lang: navigator.language || 'en-US',
      onActivity: () => {},
      onInterim: (t) => {
        if (choosing) return;
        interim = t;
        heardSpeech();
        renderRaw();
        armSilenceTimer();
        armAutoSend();
      },
      onFinal: (t) => {
        if (choosing) {
          const m = matchSpokenMode(t);
          return m ? selectMode(m) : setStatus("Didn't catch that - say 1 to 4, or tap an option");
        }
        finalText = (finalText + ' ' + t).trim();
        interim = '';
        heardSpeech();
        renderRaw();
        armSilenceTimer();
        armAutoSend();
      },
      onError: (code) => {
        if (code === 'not-allowed' || code === 'service-not-allowed') {
          stopListening();
          setStatus('Microphone blocked - allow it for this site in Chrome settings');
        } else {
          setStatus('Speech error: ' + code);
        }
      },
    });
    try {
      listener.start();
    } catch (e) {
      return setStatus('Could not start the microphone: ' + e.message);
    }
    recording = true;
    refreshState();
  }

  function stopListening() {
    clearTimeout(silenceTimer);
    clearTimeout(autoSendTimer);
    if (listener) listener.stop();
    listener = null;
    recording = false;
    refreshState();
  }

  function pause() {
    if (!recording) return;
    const wasChoosing = choosing;
    stopListening();
    if (wasChoosing) {
      choosing = false;
      refreshState();
      return setStatus('Paused - no mode chosen yet');
    }
    paused = true;
    if (interim) {
      finalText = (finalText + ' ' + interim).trim();
      interim = '';
      renderRaw();
    }
    if (!rawEl.value.trim()) return setStatus('Nothing heard');
    summariseNow('Writing draft...');
  }

  function reset() {
    if (recording) stopListening();
    summarySeq++;
    paused = false;
    choosing = false;
    mode = null;
    currentId = null;
    finalText = interim = lastKey = '';
    wordsAtLastDraft = 0;
    renderRaw();
    summaryEl.value = '';
    renderModes();
    renderHistory();
    refreshState();
    setStatus('Ready');
  }

  $('orb').onclick = () => (recording ? pause() : start());
  $('reset').onclick = reset;

  // ---------- copying ----------
  async function copyText(text, btn) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      // Fallback for browsers that refuse the clipboard API
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    const old = btn.textContent;
    btn.textContent = 'Copied';
    setTimeout(() => (btn.textContent = old), 1000);
  }
  document.querySelectorAll('.copy').forEach((b) => {
    b.onclick = () => copyText($(b.dataset.target).value, b);
  });
  $('copy-both').onclick = (e) => copyText(`RAW\n${rawEl.value}\n\nOUTPUT\n${summaryEl.value}`, e.target);

  // ---------- Send to Claude, install ----------
  $('send-claude').onclick = async (e) => {
    const btn = e.target;
    if (navigator.share) setStatus('Opening the share menu - pick Claude');
    const result = await sendToClaude(summaryEl.value, { nav: navigator, copy: (t) => copyText(t, btn) });
    if (result === 'shared') setStatus('Sent - finish in Claude');
    else if (result === 'copied') setStatus('Copied - paste it into Claude');
    else if (result === 'empty') setStatus('Nothing to send yet');
    else setStatus('Ready');
  };
  setupInstall({ win: window, button: $('install') });

  // ---------- boot ----------
  renderModes();
  refreshState();
  const savedKey = store.get(KEY_STORE);
  if (savedKey) useKey(savedKey);
  else showSetup();

  // Offline app shell + "Add to Home screen" support
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
