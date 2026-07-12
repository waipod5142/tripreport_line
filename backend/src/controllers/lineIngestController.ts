import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { trips, lineDrivers, lineMessages } from "../db/schema";
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

    if (!messageId || !lineUserId || !type) {
      return res.status(400).json({ error: "messageId, lineUserId and type are required" });
    }
    if (type === "text" && !String(text ?? "").trim()) {
      return res.status(400).json({ error: "text is required for type=text" });
    }
    if (type === "image" && !image?.base64) {
      return res.status(400).json({ error: "image.base64 is required for type=image" });
    }

    const id = String(messageId);
    const userId = String(lineUserId);
    const groupId = lineGroupId ? String(lineGroupId) : null;
    const reportedAt = timestamp ? new Date(Number(timestamp)) : new Date();

    // Dedupe by message id: once a message is archived (trip, not_trip, or a
    // non-extractable sticker) redeliveries are no-ops — no wasted re-extraction.
    // An extraction FAILURE (502 below) archives nothing, so its replay retries.
    const [seen] = await db
      .select({ id: lineMessages.id })
      .from(lineMessages)
      .where(eq(lineMessages.lineMessageId, id));
    if (seen) return res.status(200).json({ stored: false, reason: "duplicate" });

    // Learn/refresh the sender's display name so names resolve for every message.
    if (senderDisplayName) {
      await db
        .insert(lineDrivers)
        .values({ lineUserId: userId, lineDisplayName: String(senderDisplayName) })
        .onConflictDoUpdate({
          target: lineDrivers.lineUserId,
          set: { lineDisplayName: String(senderDisplayName) },
        });
    } else {
      await db.insert(lineDrivers).values({ lineUserId: userId }).onConflictDoNothing();
    }

    // Archive the raw message — the full-conversation record that mirrors the sheet.
    const archive = (extra: { isTripReport?: boolean; tripId?: string | null }) =>
      db
        .insert(lineMessages)
        .values({
          lineMessageId: id,
          lineUserId: userId,
          lineGroupId: groupId,
          type: String(type),
          text: type === "text" ? String(text) : null,
          isTripReport: extra.isTripReport ?? false,
          tripId: extra.tripId ?? null,
          reportedAt,
        })
        .onConflictDoNothing();

    // Non-extractable types (stickers, location, video…): archive only, no AI call.
    if (type !== "text" && type !== "image") {
      await archive({});
      return res.status(200).json({ stored: false, reason: "logged" });
    }

    // Extraction runs BEFORE any upload/archive, so a failure leaves nothing
    // stored and stays replayable; non-trip photos never reach Cloudinary.
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

    if (!extracted.is_trip_report) {
      await archive({ isTripReport: false });
      return res.status(200).json({ stored: false, reason: "not_trip" });
    }

    let imageUrl: string | null = null;
    if (type === "image") {
      try {
        imageUrl = await uploadImage(`data:${image.mediaType || "image/jpeg"};base64,${image.base64}`);
      } catch (err) {
        console.error("Cloudinary upload failed — storing trip without image:", err);
      }
    }

    try {
      const [trip] = await db
        .insert(trips)
        .values({
          lineMessageId: id,
          lineUserId: userId,
          lineGroupId: groupId,
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
          reportedAt,
        })
        .returning();

      await archive({ isTripReport: true, tripId: trip.id });
      return res.status(200).json({ stored: true, tripId: trip.id });
    } catch (err: unknown) {
      // Unique-violation race: another delivery created the trip first.
      if ((err as { code?: string }).code === "23505") {
        const [existingTrip] = await db
          .select({ id: trips.id })
          .from(trips)
          .where(eq(trips.lineMessageId, id));
        await archive({ isTripReport: true, tripId: existingTrip?.id ?? null });
        return res.status(200).json({ stored: false, reason: "duplicate" });
      }
      throw err;
    }
  } catch (error) {
    console.error("Error ingesting LINE message:", error);
    res.status(500).json({ error: "Failed to ingest message" });
  }
}
