import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { trips, lineDrivers } from "../db/schema";
import { ENV } from "../config/env";
import { extractTrip } from "../services/tripExtract";
import { uploadImage } from "../services/cloudinaryUpload";

export async function ingestLineMessage(req: Request, res: Response) {
  try {
    if (!ENV.LINE_INGEST_KEY || req.get("x-ingest-key") !== ENV.LINE_INGEST_KEY) {
      return res.status(401).json({ error: "Invalid ingest key" });
    }

    const { messageId, type, lineUserId, lineGroupId, senderDisplayName, timestamp, text, image } =
      req.body ?? {};

    if (!messageId || !lineUserId || (type !== "text" && type !== "image")) {
      return res.status(400).json({ error: "messageId, lineUserId and type (text|image) are required" });
    }
    if (type === "text" && !String(text ?? "").trim()) {
      return res.status(400).json({ error: "text is required for type=text" });
    }
    if (type === "image" && !image?.base64) {
      return res.status(400).json({ error: "image.base64 is required for type=image" });
    }

    // Dedupe: the relay's cache is the first line; this is the DB backstop
    const [existing] = await db
      .select({ id: trips.id })
      .from(trips)
      .where(eq(trips.lineMessageId, String(messageId)));
    if (existing) return res.status(200).json({ stored: false, reason: "duplicate" });

    // Extraction runs BEFORE any upload, so non-trip photos never reach Cloudinary
    let extracted;
    try {
      extracted = await extractTrip(
        type === "text"
          ? { text: String(text) }
          : { image: { base64: image.base64, mediaType: image.mediaType || "image/jpeg" } }
      );
    } catch (err) {
      console.error("AI extraction failed:", err);
      return res.status(502).json({ error: "AI extraction failed" });
    }
    if (!extracted) return res.status(502).json({ error: "AI extraction returned no result" });
    if (!extracted.is_trip_report) return res.status(200).json({ stored: false, reason: "not_trip" });

    let imageUrl: string | null = null;
    if (type === "image") {
      try {
        imageUrl = await uploadImage(`data:${image.mediaType || "image/jpeg"};base64,${image.base64}`);
      } catch (err) {
        console.error("Cloudinary upload failed — storing trip without image:", err);
      }
    }

    // Learn/refresh the sender's display name; never touch manualName/defaultTruck
    if (senderDisplayName) {
      await db
        .insert(lineDrivers)
        .values({ lineUserId: String(lineUserId), lineDisplayName: String(senderDisplayName) })
        .onConflictDoUpdate({
          target: lineDrivers.lineUserId,
          set: { lineDisplayName: String(senderDisplayName) },
        });
    } else {
      await db.insert(lineDrivers).values({ lineUserId: String(lineUserId) }).onConflictDoNothing();
    }

    try {
      const [trip] = await db
        .insert(trips)
        .values({
          lineMessageId: String(messageId),
          lineUserId: String(lineUserId),
          lineGroupId: lineGroupId ? String(lineGroupId) : null,
          source: type,
          aiDriverName: extracted.driver_name || null,
          truck: extracted.truck || null,
          origin: extracted.origin || null,
          destination: extracted.destination || null,
          status: extracted.status || null,
          problem: extracted.problem || null,
          notes: extracted.notes || null,
          imageUrl,
          rawMessage: type === "text" ? String(text) : "(image)",
          reportedAt: timestamp ? new Date(Number(timestamp)) : new Date(),
        })
        .returning();

      return res.status(200).json({ stored: true, tripId: trip.id });
    } catch (err: unknown) {
      // Unique-violation race: two deliveries passed the dedupe check simultaneously
      if ((err as { code?: string }).code === "23505") {
        return res.status(200).json({ stored: false, reason: "duplicate" });
      }
      throw err;
    }
  } catch (error) {
    console.error("Error ingesting LINE message:", error);
    res.status(500).json({ error: "Failed to ingest message" });
  }
}
