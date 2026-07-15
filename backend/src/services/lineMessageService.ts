import { eq } from "drizzle-orm";
import { db } from "../db";
import { trips, lineDrivers, lineMessages } from "../db/schema";
import { extractTrip } from "./tripExtract";
import { uploadImage } from "./cloudinaryUpload";

export type LineMessageInput = {
  messageId: string;
  type: string; // "text" | "image" | "sticker" | other LINE types
  lineUserId: string;
  lineGroupId?: string | null;
  senderDisplayName?: string | null;
  timestamp?: number | null;
  text?: string | null;
  image?: { base64: string; mediaType?: string } | null;
};

export type ProcessResult =
  | { stored: true; tripId: string }
  | { stored: false; reason: "duplicate" | "logged" | "not_trip" | "extraction_failed" };

/**
 * Archive one LINE message and, when it's a trip report, extract + store it.
 *
 * Durability: the raw `line_messages` row is written FIRST, before extraction,
 * so a message is never lost even if Claude/Cloudinary fail. This matters for
 * the native webhook, which cannot be replayed (LINE is already ack'd 200).
 * Dedupe is by message id; a trip additionally links back via tripId.
 */
export async function processLineMessage(input: LineMessageInput): Promise<ProcessResult> {
  const id = String(input.messageId);
  const userId = String(input.lineUserId);
  const groupId = input.lineGroupId ? String(input.lineGroupId) : null;
  const type = String(input.type);
  const reportedAt = input.timestamp ? new Date(Number(input.timestamp)) : new Date();

  // Dedupe: once archived, redeliveries are no-ops (no wasted re-extraction).
  const [seen] = await db
    .select({ id: lineMessages.id })
    .from(lineMessages)
    .where(eq(lineMessages.lineMessageId, id));
  if (seen) return { stored: false, reason: "duplicate" };

  // Learn/refresh the sender's display name so names resolve everywhere.
  if (input.senderDisplayName) {
    await db
      .insert(lineDrivers)
      .values({ lineUserId: userId, lineDisplayName: String(input.senderDisplayName) })
      .onConflictDoUpdate({
        target: lineDrivers.lineUserId,
        set: { lineDisplayName: String(input.senderDisplayName) },
      });
  } else {
    await db.insert(lineDrivers).values({ lineUserId: userId }).onConflictDoNothing();
  }

  // Archive the raw message FIRST — the full-conversation record (mirrors the sheet).
  await db
    .insert(lineMessages)
    .values({
      lineMessageId: id,
      lineUserId: userId,
      lineGroupId: groupId,
      type,
      text: type === "text" && input.text ? String(input.text) : null,
      isTripReport: false,
      tripId: null,
      reportedAt,
    })
    .onConflictDoNothing();

  // Only text/image go through AI extraction; everything else is logged only.
  const hasText = type === "text" && !!String(input.text ?? "").trim();
  const hasImage = type === "image" && !!input.image?.base64;
  if (!hasText && !hasImage) return { stored: false, reason: "logged" };

  let extracted;
  try {
    extracted = await extractTrip(
      hasText
        ? { text: String(input.text) }
        : { image: { base64: input.image!.base64, mediaType: input.image!.mediaType || "image/jpeg" } }
    );
  } catch (err) {
    console.error("AI extraction failed:", err);
    return { stored: false, reason: "extraction_failed" };
  }
  if (!extracted) return { stored: false, reason: "extraction_failed" };
  if (!extracted.is_trip_report) return { stored: false, reason: "not_trip" };

  // Non-trip photos never reach Cloudinary; trip photos are uploaded here.
  let imageUrl: string | null = null;
  if (hasImage) {
    try {
      imageUrl = await uploadImage(`data:${input.image!.mediaType || "image/jpeg"};base64,${input.image!.base64}`);
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
        source: hasImage ? "image" : "text",
        aiDriverName: extracted.driver_name || null,
        truck: extracted.truck || null,
        origin: extracted.origin || null,
        destination: extracted.destination || null,
        status: extracted.status || null,
        problem: extracted.problem || null,
        notes: extracted.notes || null,
        imageUrl,
        rawMessage: hasText ? String(input.text) : "(image)",
        reportedAt,
      })
      .returning();

    // Link the archived message to its trip.
    await db
      .update(lineMessages)
      .set({ isTripReport: true, tripId: trip.id })
      .where(eq(lineMessages.lineMessageId, id));

    return { stored: true, tripId: trip.id };
  } catch (err: unknown) {
    // Unique-violation race: another delivery created the trip first.
    if ((err as { code?: string }).code === "23505") {
      const [existingTrip] = await db
        .select({ id: trips.id })
        .from(trips)
        .where(eq(trips.lineMessageId, id));
      if (existingTrip) {
        await db
          .update(lineMessages)
          .set({ isTripReport: true, tripId: existingTrip.id })
          .where(eq(lineMessages.lineMessageId, id));
      }
      return { stored: false, reason: "duplicate" };
    }
    throw err;
  }
}
