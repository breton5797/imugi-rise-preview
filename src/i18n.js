// Localisation: ten locales, English fallback for anything missing. Strings are plain text
// with {name} placeholders; nothing here is ever interpreted as markup.
import { FALLBACK_LOCALE, LOCALES } from './config.js';
import en from './locales/en.js';
import es from './locales/es.js';
import fr from './locales/fr.js';
import id from './locales/id.js';
import ja from './locales/ja.js';
import ko from './locales/ko.js';
import ptBR from './locales/pt-BR.js';
import vi from './locales/vi.js';
import zhHans from './locales/zh-Hans.js';
import zhHant from './locales/zh-Hant.js';

export const TABLES = Object.freeze({
  ko, en, ja, 'zh-Hans': zhHans, 'zh-Hant': zhHant, es, 'pt-BR': ptBR, fr, id, vi,
});

const TRADITIONAL = /^zh-(hant|tw|hk|mo)/;

// Map a BCP 47 tag such as "pt-PT" or "zh-TW" onto a supported locale, or null.
function matchLocale(tag) {
  const lower = String(tag || '').toLowerCase();
  if (!lower) return null;
  if (lower.startsWith('zh')) return TRADITIONAL.test(lower) ? 'zh-Hant' : 'zh-Hans';
  const exact = LOCALES.find(l => l.toLowerCase() === lower);
  if (exact) return exact;
  const base = lower.split('-')[0];
  return LOCALES.find(l => l.toLowerCase().split('-')[0] === base) || null;
}

/**
 * @param {string} saved the locale chosen in settings ('' means follow the device)
 * @param {readonly string[]} preferred e.g. navigator.languages
 * @returns {string} a supported locale
 */
export function pickLocale(saved, preferred = []) {
  if (LOCALES.includes(saved)) return saved;
  for (const tag of preferred) {
    const hit = matchLocale(tag);
    if (hit) return hit;
  }
  return FALLBACK_LOCALE;
}

/** @returns {(key: string, params?: Record<string, string | number>) => string} */
export function createTranslator(locale) {
  const table = TABLES[locale] || TABLES[FALLBACK_LOCALE];
  const fallback = TABLES[FALLBACK_LOCALE];
  return (key, params = {}) => {
    const text = table[key] ?? fallback[key] ?? key;
    return text.replace(/\{(\w+)\}/g, (whole, name) => (name in params ? String(params[name]) : whole));
  };
}

let current = FALLBACK_LOCALE;
let translate = createTranslator(current);

export function setLocale(locale) {
  current = LOCALES.includes(locale) ? locale : FALLBACK_LOCALE;
  translate = createTranslator(current);
  return current;
}

export const getLocale = () => current;

/** Translate with the active locale. */
export const t = (key, params) => translate(key, params);
