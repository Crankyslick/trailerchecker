import { beforeEach, describe, expect, it, vi } from "vitest";

// Node test environment: give the queue a minimal localStorage and window.
const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});
vi.stubGlobal("window", new EventTarget());
vi.stubGlobal("CustomEvent", class extends Event {});

const { enqueue, flushQueue, queueSize, setQueueOwner } = await import("./driver-offline-queue");

function executors(calls: string[], failOn?: string) {
  return {
    status: async (loadId: string, s: string) => {
      if (loadId === failOn) throw new Error("status already advanced");
      calls.push(`${loadId}:${s}`);
    },
    exception: async () => {},
    resolveException: async () => {},
    pod: async () => {},
  };
}

describe("driver offline queue", () => {
  beforeEach(() => {
    store.clear();
    setQueueOwner(null);
  });

  it("replays only the signed-in driver's actions", async () => {
    setQueueOwner("driver-a");
    enqueue({ kind: "status", loadId: "L1", newStatus: "Loaded" });
    setQueueOwner("driver-b");
    enqueue({ kind: "status", loadId: "L2", newStatus: "En Route" });
    expect(queueSize()).toBe(1);

    const calls: string[] = [];
    const r = await flushQueue(executors(calls));
    expect(calls).toEqual(["L2:En Route"]);
    expect(r).toEqual({ done: 1, dropped: 0, remaining: 0 });

    setQueueOwner("driver-a");
    expect(queueSize()).toBe(1);
    await flushQueue(executors(calls));
    expect(calls).toEqual(["L2:En Route", "L1:Loaded"]);
  });

  it("drops a rejected action and keeps going", async () => {
    setQueueOwner("driver-a");
    enqueue({ kind: "status", loadId: "BAD", newStatus: "Loaded" });
    enqueue({ kind: "status", loadId: "L3", newStatus: "Loaded" });
    const calls: string[] = [];
    const r = await flushQueue(executors(calls, "BAD"));
    expect(calls).toEqual(["L3:Loaded"]);
    expect(r).toEqual({ done: 1, dropped: 1, remaining: 0 });
  });
});
