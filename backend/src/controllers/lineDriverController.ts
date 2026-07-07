import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { lineDrivers } from "../db/schema";

export async function getLineDrivers(_req: Request, res: Response) {
  try {
    const rows = await db.select().from(lineDrivers).orderBy(lineDrivers.createdAt);
    res.status(200).json(rows);
  } catch (error) {
    console.error("Error fetching line drivers:", error);
    res.status(500).json({ error: "Failed to fetch drivers" });
  }
}

export async function updateLineDriver(req: Request, res: Response) {
  try {
    const { lineUserId } = req.params;
    const { manualName, defaultTruck } = req.body;

    const patch: Record<string, string | null> = {};
    if (manualName !== undefined) patch.manualName = String(manualName).trim() || null;
    if (defaultTruck !== undefined) patch.defaultTruck = String(defaultTruck).trim() || null;
    if (!Object.keys(patch).length) return res.status(400).json({ error: "Nothing to update" });

    const [updated] = await db
      .update(lineDrivers)
      .set(patch)
      .where(eq(lineDrivers.lineUserId, lineUserId))
      .returning();
    if (!updated) return res.status(404).json({ error: "Driver not found" });

    res.status(200).json(updated);
  } catch (error) {
    console.error("Error updating line driver:", error);
    res.status(500).json({ error: "Failed to update driver" });
  }
}
