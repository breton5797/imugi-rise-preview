// Online leaderboard client. The local board in the save file always works; this adds the
// optional remote one. Auth is a device token the backend issues for an anonymous device id
// (no accounts, no Supabase Auth). With no endpoint configured every call resolves offline.
const TIMEOUT_MS = 4000;
const MAX_ROWS = 20;

const isObj = v => typeof v === 'object' && v !== null && !Array.isArray(v);
const offline = reason => Object.freeze({ ok: false, offline: true, reason });

async function postJson(fetchImpl, url, body, token) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const headers = { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) };
    const res = await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// The server is not trusted either: keep only well-formed rows.
function cleanRows(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(r => isObj(r) && Number.isFinite(r.score) && r.score >= 0)
    .slice(0, MAX_ROWS)
    .map(r => ({ score: Math.floor(r.score), unit: typeof r.unit === 'string' ? r.unit.slice(0, 16) : '', name: typeof r.name === 'string' ? r.name.slice(0, 24) : '' }));
}

/**
 * @param {{ url?: string, device?: string, fetchImpl?: typeof fetch, now?: () => number }} deps
 */
export function createLeaderboard({ url = '', device = '', fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  const base = url.replace(/\/+$/, '');
  let token = null; // { value, exp } kept in memory only

  async function deviceToken() {
    if (token && token.exp > now() + 5000) return token.value;
    const data = await postJson(fetchImpl, `${base}/token`, { device });
    if (!isObj(data) || typeof data.token !== 'string' || !Number.isFinite(data.exp)) throw new Error('bad token response');
    token = { value: data.token, exp: data.exp };
    return token.value;
  }

  /**
   * @param {{ board: string, score: number, unit: string, seed: number, gates: number }} entry
   * @returns {Promise<{ ok: boolean, offline?: boolean, rank?: number, reason?: string }>}
   */
  async function submit(entry) {
    if (!base || !device || !fetchImpl) return offline('not-configured');
    try {
      const data = await postJson(fetchImpl, `${base}/scores`, entry, await deviceToken());
      const rank = isObj(data) && Number.isFinite(data.rank) && data.rank > 0 ? Math.floor(data.rank) : 0;
      return Object.freeze({ ok: true, rank });
    } catch (err) {
      return offline(err instanceof Error ? err.message : 'network');
    }
  }

  /** @returns {Promise<{ ok: boolean, offline?: boolean, rows: object[] }>} */
  async function top(board) {
    if (!base || !fetchImpl) return { ...offline('not-configured'), rows: [] };
    try {
      const data = await postJson(fetchImpl, `${base}/top`, { board });
      return Object.freeze({ ok: true, rows: cleanRows(isObj(data) ? data.rows : null) });
    } catch (err) {
      return { ...offline(err instanceof Error ? err.message : 'network'), rows: [] };
    }
  }

  return { submit, top, configured: Boolean(base && device) };
}
