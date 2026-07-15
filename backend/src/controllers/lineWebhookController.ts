import type { Request, Response } from "express";
import { verifyLineSignature, downloadLineImage, fetchLineDisplayName } from "../services/lineClient";
import { processLineMessage } from "../services/lineMessageService";

// Minimal shape of the LINE webhook events we care about.
type LineEvent = {
  type: string;
  timestamp?: number;
  source?: { type?: string; userId?: string; groupId?: string; roomId?: string };
  message?: { id?: string; type?: string; text?: string };
};

export async function lineWebhook(req: Request, res: Response) {
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  const signature = req.get("x-line-signature");
  if (!verifyLineSignature(rawBody ?? JSON.stringify(req.body ?? {}), signature)) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  // LINE requires a fast 200 (verify pings send an empty events array too).
  // Ack now, then process each event in the background — the raw message is
  // archived first inside processLineMessage, so nothing is lost.
  res.status(200).json({});

  const events: LineEvent[] = Array.isArray(req.body?.events) ? req.body.events : [];
  for (const event of events) {
    handleWebhookEvent(event).catch((err) => console.error("Webhook event error:", err));
  }
}

async function handleWebhookEvent(event: LineEvent): Promise<void> {
  if (event.type !== "message" || !event.source || !event.message) return;

  const { source, message } = event;
  const lineUserId = source.userId;
  if (!lineUserId || !message.id || !message.type) return;
  const lineGroupId = source.groupId || source.roomId || null;

  // The webhook carries only a message id for images — fetch the bytes ourselves.
  let image: { base64: string; mediaType: string } | undefined;
  if (message.type === "image") {
    try {
      image = await downloadLineImage(message.id);
    } catch (err) {
      console.error("LINE image download failed — archiving without extraction:", err);
    }
  }

  const senderDisplayName = await fetchLineDisplayName(lineUserId, lineGroupId);

  await processLineMessage({
    messageId: message.id,
    type: message.type,
    lineUserId,
    lineGroupId,
    senderDisplayName,
    timestamp: event.timestamp,
    text: message.text,
    image,
  });
}
