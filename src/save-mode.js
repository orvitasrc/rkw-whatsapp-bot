'use strict';

const SAVE_TRIGGER = 'SAVETOLOCAL';
const SAVE_WINDOW_MS = 5 * 60 * 1000;

function sanitizeFolder(value) {
  let folder = String(value || '').normalize('NFC').trim()
    .replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, '_')
    .replace(/\.{2,}/g, '_').replace(/^[. ]+|[. ]+$/g, '');
  // Keep names comfortably below filesystem component limits (in UTF-8 bytes).
  folder = Array.from(folder).slice(0, 50).join('').replace(/[. ]+$/g, '');
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(folder)) folder = `_${folder}`;
  if (!folder) throw new Error('Nama folder kosong atau tidak valid.');
  return folder;
}

function createSaveMode({ now = Date.now, log = () => {} } = {}) {
  const states = new Map();
  function expire() {
    const time = now();
    for (const [sender, state] of states) {
      if (state.expiresAt && time >= state.expiresAt) {
        state.expiresAt = 0;
        log(`Save mode expired: ${sender}`);
      }
    }
  }
  function status(sender) {
    expire();
    const state = states.get(sender);
    return { activeFolder: state?.activeFolder || null,
      remainingMs: Math.max(0, (state?.expiresAt || 0) - now()) };
  }
  return {
    expire, status,
    setFolder(sender, name) {
      const activeFolder = sanitizeFolder(name);
      const state = states.get(sender) || { expiresAt: 0, session: {} };
      state.activeFolder = activeFolder;
      states.set(sender, state);
      log(`Folder set: ${sender} -> ${activeFolder}`);
      return activeFolder;
    },
    activate(sender) {
      expire();
      const state = states.get(sender);
      if (!state?.activeFolder) return false;
      state.session = {};
      state.expiresAt = now() + SAVE_WINDOW_MS;
      log(`Save mode ON: ${sender}`);
      return true;
    },
    stop(sender) {
      const active = status(sender).remainingMs > 0;
      const state = states.get(sender);
      if (state) { state.expiresAt = 0; state.session = {}; }
      log(`Save mode OFF: ${sender}`);
      return active;
    },
    acceptImage(sender) {
      if (!status(sender).remainingMs) return null;
      const state = states.get(sender);
      return { activeFolder: state.activeFolder, session: state.session };
    },
    refresh(sender, accepted) {
      const state = states.get(sender);
      // A completed download must not undo STOPLOCAL or overwrite a new session.
      if (!state || state.session !== accepted.session || !state.expiresAt) return;
      state.expiresAt = now() + SAVE_WINDOW_MS;
      log(`Save mode refreshed: ${sender}`);
    },
  };
}

module.exports = { SAVE_TRIGGER, SAVE_WINDOW_MS, sanitizeFolder, createSaveMode };
