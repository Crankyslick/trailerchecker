// Server-only. Never import this from client code — it reads TWILIO_AUTH_TOKEN,
// which must never reach the browser bundle.
import Twilio from "twilio";

let client: ReturnType<typeof Twilio> | null | undefined;

function getClient(): ReturnType<typeof Twilio> | null {
  if (client !== undefined) return client;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    console.error("[sendSms] TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not set — SMS disabled");
    client = null;
    return client;
  }
  client = Twilio(sid, token);
  return client;
}

// Loose E.164 check — "+" then 8 to 15 digits. Good enough to catch obviously
// malformed input before it reaches Twilio; Twilio is the real validator.
const E164 = /^\+[1-9]\d{7,14}$/;

export type SendSmsResult = { sent: true } | { sent: false; reason: string };

/**
 * Sends one SMS. Never throws — every failure mode (bad number, missing
 * config, Twilio error) returns { sent: false, reason } and logs, so a
 * caller can fire this without a try/catch and never risk it taking down
 * the operation it's a side effect of.
 */
export async function sendSms(to: string, message: string): Promise<SendSmsResult> {
  if (!E164.test(to)) {
    console.error(`[sendSms] invalid phone number, skipping: ${to}`);
    return { sent: false, reason: "invalid_phone" };
  }

  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!from) {
    console.error("[sendSms] TWILIO_PHONE_NUMBER not set — SMS disabled");
    return { sent: false, reason: "not_configured" };
  }

  const twilioClient = getClient();
  if (!twilioClient) return { sent: false, reason: "not_configured" };

  try {
    await twilioClient.messages.create({ to, from, body: message });
    return { sent: true };
  } catch (e) {
    console.error(`[sendSms] failed to send to ${to}:`, (e as Error).message);
    return { sent: false, reason: "send_failed" };
  }
}
