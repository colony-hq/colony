// localStorage access, always wrapped: storage can be missing or throw (private mode,
// sandboxed previews). The game must run fine without it.

const PREFIX = 'hoodvale.v1.';

export function loadJSON(key, fallback = null) {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function saveJSON(key, value) {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key) {
  try { window.localStorage.removeItem(PREFIX + key); } catch { /* ignore */ }
}
