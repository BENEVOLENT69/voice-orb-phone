// Getting the output to Claude, and offering to install the app.
// Send to Claude opens Android's share menu (pick Claude there); without one, it copies instead.

async function sendToClaude(text, { nav, copy }) {
  if (!text || !text.trim()) return 'empty';
  if (nav && typeof nav.share === 'function') {
    try {
      await nav.share({ text });
      return 'shared';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';
    }
  }
  await copy(text);
  return 'copied';
}

// Shows `button` only while Chrome is offering to install, and never inside the installed app.
function setupInstall({ win, button }) {
  const installed = () => win.matchMedia && win.matchMedia('(display-mode: standalone)').matches;
  let offer = null;
  win.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    if (installed()) return;
    offer = e;
    button.hidden = false;
  });
  win.addEventListener('appinstalled', () => {
    offer = null;
    button.hidden = true;
  });
  button.onclick = async () => {
    if (!offer) return;
    const e = offer;
    offer = null;
    button.hidden = true;
    await e.prompt();
  };
}

const shareApi = { sendToClaude, setupInstall };
if (typeof module !== 'undefined' && module.exports) module.exports = shareApi;
if (typeof window !== 'undefined') window.VoiceShare = shareApi;
