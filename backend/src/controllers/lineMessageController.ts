import type { Request, Response } from "express";
import { and, asc, gte, lt } from "drizzle-orm";
import { db } from "../db";
import { lineMessages } from "../db/schema";

/** yyyy-MM-dd for "today" in Asia/Bangkok */
function bkkToday(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
}

/** [start, end) of a Bangkok calendar day */
function bkkDayWindow(date: string): [Date, Date] {
  const start = new Date(`${date}T00:00:00+07:00`);
  return [start, new Date(start.getTime() + 24 * 60 * 60 * 1000)];
}

/** manualName → lineDisplayName → lineUserId (messages have no aiDriverName) */
function resolveDriverName(m: {
  lineUserId: string;
  driver: { manualName: string | null; lineDisplayName: string | null } | null;
}): string {
  return m.driver?.manualName || m.driver?.lineDisplayName || m.lineUserId;
}

export async function getLineMessages(req: Request, res: Response) {
  try {
    const { date, driver } = req.query as { date?: string; driver?: string };
    // Default to today so the conversation view stays bounded, like a chat log.
    const [start, end] = bkkDayWindow(date || bkkToday());

    const rows = await db.query.lineMessages.findMany({
      where: and(gte(lineMessages.reportedAt, start), lt(lineMessages.reportedAt, end)),
      with: { driver: true },
      orderBy: [asc(lineMessages.reportedAt)], // chronological, oldest first
      limit: 500,
    });

    const resolved = rows.map((r) => ({ ...r, driverName: resolveDriverName(r) }));
    const filtered = driver ? resolved.filter((r) => r.driverName.includes(driver)) : resolved;

    res.status(200).json(filtered);
  } catch (error) {
    console.error("Error fetching line messages:", error);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
}
