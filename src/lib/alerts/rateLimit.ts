// In-memory only, per the brief ("simple in-memory or timestamp check is
// fine"). Known limitations, both acceptable for MVP alerting and worth
// knowing if this ever needs to be load-bearing: resets on every deploy/
// restart, and does not share state across multiple server instances — a
// second instance could send a duplicate. If that becomes a real problem,
// this is a one-table swap (an `alert_log` row with a unique constraint on
// `(type, load_id, window)`), not a redesign.
const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const lastSent = new Map<string, number>();

/** Returns true if this alert should be sent, and records it if so. */
export function shouldSend(key: string): boolean {
  const now = Date.now();
  const last = lastSent.get(key);
  if (last !== undefined && now - last < COOLDOWN_MS) return false;
  lastSent.set(key, now);

  // Prevent unbounded growth in a long-lived process.
  if (lastSent.size > 5000) {
    const cutoff = now - COOLDOWN_MS;
    for (const [k, t] of lastSent) if (t < cutoff) lastSent.delete(k);
  }

  return true;
}
