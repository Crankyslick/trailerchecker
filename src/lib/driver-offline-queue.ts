// Offline action queue for the driver app. Actions that fail because the
// device has no connectivity are stored in localStorage and replayed in order
// when the connection returns. POD photos are NOT queued (they need a live
// Storage upload); the driver is told to retry the photo.

const KEY = "driver-offline-queue:v1";
const EVENT = "driver-offline-queue:changed";

export type QueuedAction =
  | { id: string; at: string; kind: "status"; loadId: string; newStatus: string }
  | { id: string; at: string; kind: "exception"; loadId: string; reason: string }
  | { id: string; at: string; kind: "resolve_exception"; loadId: string; note: string | null }
  | {
      id: string;
      at: string;
      kind: "pod";
      loadId: string;
      recipientName: string;
      signatureSvg: string | null;
      notes: string | null;
    };

type Distribute<T> = T extends unknown ? Omit<T, "id" | "at"> : never;
export type NewAction = Distribute<QueuedAction>;

function read(): QueuedAction[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedAction[]) : [];
  } catch {
    return [];
  }
}

function write(list: QueuedAction[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage full/blocked: nothing more we can do */
  }
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENT));
}

export function enqueue(action: NewAction): void {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  write([...read(), { ...action, id, at: new Date().toISOString() } as QueuedAction]);
}

export function queueSize(): number {
  return read().length;
}

/** True when the failure looks like missing connectivity rather than a server rejection. */
export function isLikelyOffline(error: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (error instanceof TypeError) return true;
  const msg = error instanceof Error ? error.message : String(error ?? "");
  return /failed to fetch|networkerror|network request failed|load failed/i.test(msg);
}

export interface QueueExecutors {
  status: (loadId: string, newStatus: string) => Promise<void>;
  exception: (loadId: string, reason: string) => Promise<void>;
  resolveException: (loadId: string, note: string | null) => Promise<void>;
  pod: (input: {
    loadId: string;
    recipientName: string;
    signatureSvg: string | null;
    notes: string | null;
  }) => Promise<void>;
}

let flushing = false;

/** Replays queued actions in order. Stops at the first failure and keeps the rest. */
export async function flushQueue(
  ex: QueueExecutors,
): Promise<{ done: number; dropped: number; remaining: number }> {
  if (flushing) return { done: 0, dropped: 0, remaining: queueSize() };
  flushing = true;
  let done = 0;
  let dropped = 0;
  try {
    for (;;) {
      const list = read();
      const a = list[0];
      if (!a) break;
      try {
        if (a.kind === "status") await ex.status(a.loadId, a.newStatus);
        else if (a.kind === "exception") await ex.exception(a.loadId, a.reason);
        else if (a.kind === "resolve_exception") await ex.resolveException(a.loadId, a.note);
        else await ex.pod(a);
      } catch (e) {
        if (isLikelyOffline(e)) break; // still offline: keep everything
        // Server rejected it (e.g. status already advanced): drop this one so it
        // can't block the queue forever, and continue with the rest.
        write(read().slice(1));
        dropped++;
        continue;
      }
      write(read().slice(1));
      done++;
    }
  } finally {
    flushing = false;
  }
  return { done, dropped, remaining: queueSize() };
}

export function onQueueChanged(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}
