import type { Request, Response } from "express";
import { ENV } from "../config/env";
import { processLineMessage } from "../services/lineMessageService";

/**
 * X-Ingest-Key path (used by the Apps Script relay / manual replay & testing).
 * The native LINE webhook lives in lineWebhookController; both share
 * processLineMessage so storage behaviour is identical.
 */
export async function ingestLineMessage(req: Request, res: Response) {
  try {
    if (!ENV.LINE_INGEST_KEY || req.get("x-ingest-key") !== ENV.LINE_INGEST_KEY) {
      return res.status(401).json({ error: "Invalid ingest key" });
    }

    const { messageId, type, lineUserId, text, image } = req.body ?? {};
    if (!messageId || !lineUserId || !type) {
      return res.status(400).json({ error: "messageId, lineUserId and type are required" });
    }
    if (type === "text" && !String(text ?? "").trim()) {
      return res.status(400).json({ error: "text is required for type=text" });
    }
    if (type === "image" && !image?.base64) {
      return res.status(400).json({ error: "image.base64 is required for type=image" });
    }

    const result = await processLineMessage(req.body);
    if (result.stored === false && result.reason === "extraction_failed") {
      return res.status(502).json({ error: "AI extraction failed" });
    }
    return res.status(200).json(result);
  } catch (error) {
    console.error("Error ingesting LINE message:", error);
    return res.status(500).json({ error: "Failed to ingest message" });
  }
}
