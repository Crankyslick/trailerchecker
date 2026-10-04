// Single place that registers the offline service worker. Refuses (and cleans
// up) in dev, preview, iframes, or when ?sw=off is present.
const SW_PATH = "/sw.js";

function refused(): boolean {
  if (!import.meta.env.PROD) return true;
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }
  const h = window.location.hostname;
  if (h.startsWith("id-preview--") || h.startsWith("preview--")) return true;
  const bad = ["lovableproject.com", "lovableproject-dev.com", "beta.lovable.dev"];
  if (bad.some((d) => h === d || h.endsWith(`.${d}`))) return true;
  if (new URLSearchParams(window.location.search).get("sw") === "off") return true;
  return false;
}

export async function registerDriverServiceWorker(): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  if (refused()) {
    const regs = await navigator.serviceWorker.getRegistrations().catch(() => []);
    await Promise.allSettled(
      regs
        .filter((r) => (r.active ?? r.installing ?? r.waiting)?.scriptURL.endsWith(SW_PATH))
        .map((r) => r.unregister()),
    );
    return;
  }
  await navigator.serviceWorker.register(SW_PATH).catch(() => {});
}
