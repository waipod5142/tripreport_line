import type { Request, Response } from "express";
import { and, desc, eq, gte, ilike, lt } from "drizzle-orm";
import { db } from "../db";
import { trips } from "../db/schema";

/** yyyy-MM-dd for "today" in Asia/Bangkok */
function bkkToday(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
}

/** [start, end) of a Bangkok calendar day */
function bkkDayWindow(date: string): [Date, Date] {
  const start = new Date(`${date}T00:00:00+07:00`);
  return [start, new Date(start.getTime() + 24 * 60 * 60 * 1000)];
}

/** manualName → aiDriverName → lineDisplayName → lineUserId */
function resolveDriverName(t: {
  aiDriverName: string | null;
  lineUserId: string;
  driver: { manualName: string | null; lineDisplayName: string | null } | null;
}): string {
  return t.driver?.manualName || t.aiDriverName || t.driver?.lineDisplayName || t.lineUserId;
}

export async function getTrips(req: Request, res: Response) {
  try {
    const { date, driver, truck } = req.query as { date?: string; driver?: string; truck?: string };

    const conds = [];
    if (date) {
      const [start, end] = bkkDayWindow(date);
      conds.push(gte(trips.reportedAt, start), lt(trips.reportedAt, end));
    }
    if (truck) conds.push(ilike(trips.truck, `%${truck}%`));

    const rows = await db.query.trips.findMany({
      where: conds.length ? and(...conds) : undefined,
      with: { driver: true },
      orderBy: [desc(trips.reportedAt)],
      limit: 300,
    });

    const resolved = rows.map((r) => ({ ...r, driverName: resolveDriverName(r) }));
    const filtered = driver ? resolved.filter((r) => r.driverName.includes(driver)) : resolved;

    res.status(200).json(filtered);
  } catch (error) {
    console.error("Error fetching trips:", error);
    res.status(500).json({ error: "Failed to fetch trips" });
  }
}

export async function getTripSummary(req: Request, res: Response) {
  try {
    const date = (req.query.date as string) || bkkToday();
    const [start, end] = bkkDayWindow(date);

    const rows = await db.query.trips.findMany({
      where: and(gte(trips.reportedAt, start), lt(trips.reportedAt, end)),
      with: { driver: true },
    });

    type Group = { name: string; count: number; routes: string[]; problems: string[] } & Record<string, unknown>;
    const byDriver: Record<string, Group> = {};
    const byTruck: Record<string, Group> = {};

    for (const t of rows) {
      const driverName = resolveDriverName(t);
      const truckName = t.truck || "(ไม่ทราบ)";
      const route = t.origin || t.destination ? `${t.origin || "?"} → ${t.destination || "?"}` : "";

      const add = (map: Record<string, Group>, key: string, other: string | null, otherKey: string) => {
        if (!map[key]) map[key] = { name: key, count: 0, routes: [], [otherKey]: [], problems: [] };
        const g = map[key];
        g.count++;
        if (route && !g.routes.includes(route)) g.routes.push(route);
        const list = g[otherKey] as string[];
        if (other && other !== "(ไม่ทราบ)" && !list.includes(other)) list.push(other);
        if (t.problem && !g.problems.includes(t.problem)) g.problems.push(t.problem);
      };

      add(byDriver, driverName, t.truck, "trucks");
      add(byTruck, truckName, driverName, "drivers");
    }

    res.status(200).json({ date, byDriver: Object.values(byDriver), byTruck: Object.values(byTruck) });
  } catch (error) {
    console.error("Error building trip summary:", error);
    res.status(500).json({ error: "Failed to build summary" });
  }
}

export async function deleteTrip(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const [deleted] = await db.delete(trips).where(eq(trips.id, id)).returning();
    if (!deleted) return res.status(404).json({ error: "Trip not found" });
    res.status(200).json(deleted);
  } catch (error) {
    console.error("Error deleting trip:", error);
    res.status(500).json({ error: "Failed to delete trip" });
  }
}
