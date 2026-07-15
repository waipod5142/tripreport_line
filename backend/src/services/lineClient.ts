import crypto from "crypto";
import { ENV } from "../config/env";

/**
 * Verify LINE's `x-line-signature`: HMAC-SHA256 of the RAW request body keyed
 * by the channel secret, base64-encoded. This is how the backend proves a
 * webhook request genuinely came from LINE (replaces the relay's X-Ingest-Key).
 */
export function verifyLineSignature(rawBody: Buffer | string, signature: string | undefined): boolean {
  if (!ENV.LINE_CHANNEL_SECRET || !signature) return false;
  const expected = crypto
    .createHmac("sha256", ENV.LINE_CHANNEL_SECRET)
    .update(rawBody)
    .digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Download an image message's bytes (the webhook carries only a message id). */
export async function downloadLineImage(messageId: string): Promise<{ base64: string; mediaType: string }> {
  const res = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
    headers: { Authorization: `Bearer ${ENV.LINE_CHANNEL_ACCESS_TOKEN}` },
  });
  if (!res.ok) throw new Error(`LINE content fetch failed: ${res.status}`);
  const mediaType = res.headers.get("content-type") || "image/jpeg";
  const buf = Buffer.from(await res.arrayBuffer());
  return { base64: buf.toString("base64"), mediaType };
}

/** Best-effort sender display name (group member if in a group, else profile). */
export async function fetchLineDisplayName(userId: string, groupId?: string | null): Promise<string> {
  if (!ENV.LINE_CHANNEL_ACCESS_TOKEN) return "";
  const url = groupId
    ? `https://api.line.me/v2/bot/group/${groupId}/member/${userId}`
    : `https://api.line.me/v2/bot/profile/${userId}`;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${ENV.LINE_CHANNEL_ACCESS_TOKEN}` } });
    if (res.ok) {
      const data = (await res.json()) as { displayName?: string };
      return data.displayName || "";
    }
  } catch (err) {
    console.error("LINE display name fetch failed:", err);
  }
  return "";
}
