import { fireWebhookEvent } from "@/lib/webhook.functions";

/**
 * Fire-and-forget push of an operational event to the company's configured
 * Google Sheet webhook. The webhook URL never leaves the server — this just
 * asks the backend to deliver the event.
 */
export function fireWebhook(event: string, payload: Record<string, unknown>) {
  void fireWebhookEvent({ data: { event, payload } }).catch(() => {});
}

// Kept for call-site compatibility: the URL cache now lives server-side.
export function invalidateWebhookCache() {
  /* no-op */
}
