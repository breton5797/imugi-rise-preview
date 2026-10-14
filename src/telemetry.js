// Telemetry: tutorial_complete, run_end, d1_return, d7_return (plus first_open). Events are queued in
// local storage so nothing is lost offline; they leave the device only when an endpoint is
// configured, and carry no personal data — just the anonymous device id and gameplay numbers.
import { EVENTS_KEY } from './config.js';

export const EVENT_NAMES = Object.freeze(['first_open', 'tutorial_complete', 'run_end', 'd1_return', 'd7_return']);
const MAX_QUEUE = 200;
const NAME_RE = /^[a-z0-9_]{1,40}$/;

const isObj = v => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Keep only flat, JSON-safe gameplay values. */
function cleanProps(props) {
  if (!isObj(props)) return {};
  const ok = v => typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && v.length <= 64);
  return Object.fromEntries(Object.entries(props).filter(([, v]) => ok(v)));
}

/**
 * @param {{ storage?: Storage | null, now?: () => number, endpoint?: string, send?: (url: string, body: string) => boolean, device?: string }} deps
 */
export function createTelemetry({ storage = null, now = Date.now, endpoint = '', send = null, device = '' } = {}) {
  let memory = [];
  let broken = false; // set once a write fails: from then on the session queue is the truth

  function read() {
    if (!storage || broken) return memory;
    try {
      const raw = JSON.parse(storage.getItem(EVENTS_KEY) || '[]');
      return Array.isArray(raw) ? raw.filter(e => isObj(e) && NAME_RE.test(e.name)) : [];
    } catch (err) {
      return memory; // unreadable store: fall back to this session's queue
    }
  }

  function write(queue) {
    memory = queue;
    if (!storage || broken) return;
    try { storage.setItem(EVENTS_KEY, JSON.stringify(queue)); } catch (err) { broken = true; /* full or blocked */ }
  }

  /** @returns {object | null} the queued event, or null when the name is not a known event */
  function track(name, props = {}) {
    if (!EVENT_NAMES.includes(name)) return null;
    const event = { name, t: now(), props: cleanProps(props) };
    write([...read(), event].slice(-MAX_QUEUE));
    return event;
  }

  /** Hand the queue to the endpoint. Returns how many events left the device. */
  function flush() {
    const queue = read();
    if (!endpoint || !send || !queue.length) return 0;
    const delivered = send(endpoint, JSON.stringify({ device, events: queue }));
    if (!delivered) return 0;
    write([]);
    return queue.length;
  }

  return { track, flush, pending: () => read() };
}
