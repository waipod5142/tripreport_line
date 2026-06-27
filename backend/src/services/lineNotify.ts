import { ENV } from "../config/env";

/**
 * LINE Messaging API push helper.
 *
 * Fires automated OA messages mirroring the order lifecycle to the customer's
 * LINE thread. Safe no-op (logs only) when LINE_CHANNEL_ACCESS_TOKEN is unset,
 * so the app runs fine in local/dev environments without LINE configured.
 *
 * Customer LINE userId is stored in `users.lineUserId` (set when the customer
 * links their LINE account). If absent, the push is skipped with a log line.
 */

const LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push";

export function isLineConfigured(): boolean {
  return Boolean(ENV.LINE_CHANNEL_ACCESS_TOKEN);
}

type LineMessage = Record<string, unknown>;

/** Low-level push. Best-effort: never throws to the caller. */
export async function pushMessage(
  to: string | null | undefined,
  messages: LineMessage[],
): Promise<boolean> {
  if (!isLineConfigured()) {
    console.log("[LINE skipped] not configured — would push:", JSON.stringify(messages));
    return false;
  }
  if (!to) {
    console.log("[LINE skipped] no lineUserId on customer — would push:", JSON.stringify(messages));
    return false;
  }
  try {
    const resp = await fetch(LINE_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ENV.LINE_CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({ to, messages }),
    });
    if (!resp.ok) {
      const body = await resp.text();
      console.error(`[LINE error] push failed ${resp.status}: ${body}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[LINE error] push threw:", err);
    return false;
  }
}

/* ── High-level lifecycle notifications ───────────────────── */

interface CancelArgs {
  to: string | null | undefined; // customer's lineUserId
  orderNumber: string;
  productName?: string;
  quantityM3?: number | string;
  siteLabel?: string;
}

/** Order cancelled / deleted by the customer. */
export async function notifyOrderCancelled(args: CancelArgs): Promise<boolean> {
  const { to, orderNumber, productName, quantityM3, siteLabel } = args;
  const num = (orderNumber || "").slice(-4);
  const lines = [
    `ยกเลิกคำสั่งซื้อ #${num} เรียบร้อยแล้วค่ะ 🗑️`,
    productName ? `สินค้า: ${productName}${quantityM3 ? ` · ${quantityM3} คิว` : ""}` : "",
    siteLabel ? `หน้างาน: ${siteLabel}` : "",
    "หากต้องการสั่งใหม่ ทักแชทนี้ได้เลยนะคะ 🙏",
  ].filter(Boolean);
  return pushMessage(to, [{ type: "text", text: lines.join("\n") }]);
}
