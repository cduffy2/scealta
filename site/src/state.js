// Reader preferences. Storage is a convenience only: every read and write is guarded,
// and the page works the same when it is unavailable (private windows, blocked storage).
const KEY = 'bradan-prefs';

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

const saved = load();
const systemReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const state = {
  lang: saved.lang === 'ga' ? 'ga' : 'en',
  motion: saved.motion ?? (systemReducedMotion ? 'off' : 'on'),
  mode: saved.mode === 'listen' ? 'listen' : 'read',
  // Sound always starts off: browsers only allow audio after the reader acts.
  sound: false,
};

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ lang: state.lang, motion: state.motion, mode: state.mode }));
  } catch {
    /* storage unavailable: preferences last for this visit only */
  }
}
