import { useSyncExternalStore } from "react";

export type RealtimeState = "connecting" | "connected" | "error";

export type HealthEntry = {
  /** Human readable error message from the last failed fetch, if any. */
  error: string | null;
  /** Epoch ms of the last successful fetch. */
  updatedAt: number | null;
  realtime: RealtimeState;
};

export type HealthSnapshot = {
  entries: Record<string, HealthEntry>;
  /** True when every registered feed loaded successfully. */
  ok: boolean;
  /** Feeds that are currently failing. */
  failing: string[];
  /** True when at least one realtime channel is disconnected. */
  realtimeDown: boolean;
  /** Oldest successful refresh across feeds (epoch ms), null if nothing loaded. */
  lastUpdatedAt: number | null;
};

const state = new Map<string, HealthEntry>();
const listeners = new Set<() => void>();
let snapshot: HealthSnapshot = build();

function build(): HealthSnapshot {
  const entries: Record<string, HealthEntry> = {};
  const failing: string[] = [];
  let realtimeDown = false;
  let lastUpdatedAt: number | null = null;

  state.forEach((entry, key) => {
    entries[key] = entry;
    if (entry.error) failing.push(key);
    if (entry.realtime === "error") realtimeDown = true;
    if (entry.updatedAt != null) {
      lastUpdatedAt =
        lastUpdatedAt == null ? entry.updatedAt : Math.min(lastUpdatedAt, entry.updatedAt);
    }
  });

  return { entries, ok: failing.length === 0, failing, realtimeDown, lastUpdatedAt };
}

function emit() {
  snapshot = build();
  listeners.forEach((l) => l());
}

/** Record the health of one data feed (query key). Safe to call from render effects. */
export function reportDataHealth(key: string, patch: Partial<HealthEntry>) {
  const prev = state.get(key) ?? {
    error: null,
    updatedAt: null,
    realtime: "connecting" as RealtimeState,
  };
  const next: HealthEntry = { ...prev, ...patch };
  if (
    prev.error === next.error &&
    prev.updatedAt === next.updatedAt &&
    prev.realtime === next.realtime
  )
    return;
  state.set(key, next);
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

const serverSnapshot: HealthSnapshot = {
  entries: {},
  ok: true,
  failing: [],
  realtimeDown: false,
  lastUpdatedAt: null,
};

export function useDataHealth(): HealthSnapshot {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => serverSnapshot,
  );
}

/**
 * True when live data is trustworthy enough to allow writes.
 * Used to block dispatch/yard actions during an outage.
 */
export function useDataWritable(): boolean {
  return useDataHealth().ok;
}
