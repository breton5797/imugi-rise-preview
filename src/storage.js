// localStorage boundary. Reads are validated by normalizeSave; a blocked or full store
// degrades to an in-memory session instead of breaking the game.
import { SAVE_KEY } from './config.js';
import { defaultSave, normalizeSave } from './progress.js';

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? normalizeSave(JSON.parse(raw)) : defaultSave();
  } catch (err) {
    return defaultSave();
  }
}

/** @returns {boolean} whether the save reached persistent storage */
export function persistSave(save) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch (err) {
    return false;
  }
}
