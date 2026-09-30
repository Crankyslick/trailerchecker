// Server-only. Never import this from client code — it reads RESEND_API_KEY,
// which must never reach the browser bundle.
import { Resend } from "resend";

let client: Resend | null | undefined;

function getClient(): Resend | null {
  if (client !== undefined) return client;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error("[sendEmail] RESEND_API_KEY not set — email disabled");
    client = null;
    return client;
  }
  client = new Resend(key);
  return client;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SendEmailResult = { sent: true } | { sent: false; reason: string };

/**
 * Sends one email. Never throws — every failure mode (bad address, missing
 * config, Resend error) returns { sent: false, reason } and logs, so a
 * caller can fire this without a try/catch and never risk it taking down
 * the operation it's a side effect of.
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<SendEmailResult> {
  if (!EMAIL.test(to)) {
    console.error(`[sendEmail] invalid email address, skipping: ${to}`);
    return { sent: false, reason: "invalid_email" };
  }

  const from = process.env.ALERT_FROM_EMAIL;
  if (!from) {
    console.error("[sendEmail] ALERT_FROM_EMAIL not set — email disabled");
    return { sent: false, reason: "not_configured" };
  }

  const resendClient = getClient();
  if (!resendClient) return { sent: false, reason: "not_configured" };

  try {
    const { error } = await resendClient.emails.send({ from, to, subject, html });
    if (error) {
      console.error(`[sendEmail] failed to send to ${to}:`, error.message);
      return { sent: false, reason: "send_failed" };
    }
    return { sent: true };
  } catch (e) {
    console.error(`[sendEmail] failed to send to ${to}:`, (e as Error).message);
    return { sent: false, reason: "send_failed" };
  }
}
