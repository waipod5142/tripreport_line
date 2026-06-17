import { Request, Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { deliverySchedules, orderItems, orders, trucks } from "../db/schema";

export const getSchedule = async (_req: Request, res: Response) => {
  try {
    const rows = await db.query.deliverySchedules.findMany({
      with: {
        order: { with: { items: { with: { product: true } }, customer: true } },
        truck: true,
        driver: true,
      },
      orderBy: [desc(deliverySchedules.scheduledDate), deliverySchedules.scheduledStartTime],
    });
    res.status(200).json(rows);
  } catch (error) {
    console.error("Error fetching schedules:", error);
    res.status(500).json({ error: "Failed to fetch schedules" });
  }
};

/**
 * Body: { orderId, assignments: [{ truckId, quantityM3, scheduledDate, scheduledStartTime, scheduledEndTime }], dispatcherNotes }
 * Creates one delivery_schedule row per truck. Updates order status → "scheduled".
 */
export const createSchedule = async (req: Request, res: Response) => {
  try {
    const { orderId, assignments, dispatcherNotes } = req.body as {
      orderId: string;
      assignments: {
        truckId: string;
        quantityM3: number;
        scheduledDate: string;
        scheduledStartTime: string;
        scheduledEndTime: string;
      }[];
      dispatcherNotes?: string;
    };

    if (!orderId || !Array.isArray(assignments) || assignments.length === 0) {
      return res.status(400).json({ error: "Missing orderId or assignments array" });
    }

    // Validate total assigned qty ≤ order qty
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    const orderTotalQty = items.reduce((s, i) => s + Number(i.quantityM3), 0);
    const assignedTotal = assignments.reduce((s, a) => s + Number(a.quantityM3), 0);
    if (assignedTotal > orderTotalQty + 0.001) {
      return res.status(400).json({ error: `ปริมาณรวมที่จัดสรร (${assignedTotal} คิว) เกินปริมาณออเดอร์ (${orderTotalQty} คิว)` });
    }

    // Conflict check per truck
    const norm = (t: string) => t.slice(0, 5);
    for (const a of assignments) {
      const existing = await db
        .select()
        .from(deliverySchedules)
        .where(and(eq(deliverySchedules.truckId, a.truckId), eq(deliverySchedules.scheduledDate, a.scheduledDate)));

      const conflict = existing.find((s) => {
        if (["completed", "failed"].includes(s.status)) return false;
        const sS = norm(s.scheduledStartTime ?? "");
        const sE = norm(s.scheduledEndTime ?? "");
        return sS && sE && sS < norm(a.scheduledEndTime) && sE > norm(a.scheduledStartTime);
      });

      if (conflict) {
        return res.status(409).json({ error: `รถ ${a.truckId} มีคิวซ้อนทับในช่วงเวลานี้แล้ว` });
      }
    }

    // Create all schedule entries
    const created = (
      await Promise.all(
        assignments.map((a) =>
          db
            .insert(deliverySchedules)
            .values({
              orderId,
              truckId: a.truckId,
              driverId: null,
              quantityM3: String(a.quantityM3),
              scheduledDate: a.scheduledDate,
              scheduledStartTime: a.scheduledStartTime,
              scheduledEndTime: a.scheduledEndTime,
              dispatcherNotes,
              status: "scheduled",
            })
            .returning()
        )
      )
    ).flat();

    await db.update(orders).set({ status: "scheduled" }).where(eq(orders.id, orderId));

    res.status(201).json(created);
  } catch (error) {
    console.error("Error creating schedule:", error);
    res.status(500).json({ error: "Failed to create schedule" });
  }
};

export const updateScheduleStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const valid = ["scheduled", "in_transit", "completed", "failed"];
    if (!valid.includes(status)) return res.status(400).json({ error: "Invalid status" });

    const [updated] = await db
      .update(deliverySchedules)
      .set({ status })
      .where(eq(deliverySchedules.id, id))
      .returning();

    if (!updated) return res.status(404).json({ error: "Schedule not found" });

    // Determine order status from all sibling schedules
    const siblings = await db.select().from(deliverySchedules).where(eq(deliverySchedules.orderId, updated.orderId));
    const allDone      = siblings.every((s) => s.status === "completed");
    const anyTransit   = siblings.some((s) => s.status === "in_transit");
    const allFailed    = siblings.every((s) => s.status === "failed");

    const orderStatus  = allDone ? "delivered" : anyTransit ? "in_transit" : allFailed ? "cancelled" : null;
    if (orderStatus) {
      await db.update(orders).set({ status: orderStatus }).where(eq(orders.id, updated.orderId));
    }

    res.status(200).json(updated);
  } catch (error) {
    console.error("Error updating schedule status:", error);
    res.status(500).json({ error: "Failed to update schedule status" });
  }
};

/**
 * PUT /api/schedule
 * Replaces all schedule rows for an order. Used by dispatcher to edit an already-scheduled order.
 * Body: same shape as createSchedule.
 * Validates total qty ≤ order qty. Conflict check excludes the order's own existing rows.
 * Blocked if any sibling is in_transit.
 */
export const replaceSchedule = async (req: Request, res: Response) => {
  try {
    const { orderId, assignments, dispatcherNotes } = req.body as {
      orderId: string;
      assignments: {
        truckId: string;
        quantityM3: number;
        scheduledDate: string;
        scheduledStartTime: string;
        scheduledEndTime: string;
      }[];
      dispatcherNotes?: string;
    };

    if (!orderId || !Array.isArray(assignments) || assignments.length === 0) {
      return res.status(400).json({ error: "Missing orderId or assignments array" });
    }

    // Block edit if any schedule is already in_transit
    const existing = await db.select().from(deliverySchedules).where(eq(deliverySchedules.orderId, orderId));
    if (existing.some((s) => s.status === "in_transit")) {
      return res.status(400).json({ error: "ไม่สามารถแก้ไขได้: รถบางคันออกเดินทางแล้ว" });
    }

    // Validate total assigned qty ≤ order qty
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    const orderTotalQty = items.reduce((s, i) => s + Number(i.quantityM3), 0);
    const assignedTotal = assignments.reduce((s, a) => s + Number(a.quantityM3), 0);
    if (assignedTotal > orderTotalQty + 0.001) {
      return res.status(400).json({ error: `ปริมาณรวมที่จัดสรร (${assignedTotal} คิว) เกินปริมาณออเดอร์ (${orderTotalQty} คิว)` });
    }

    // Conflict check — exclude this order's own schedules (they're being replaced)
    const norm = (t: string) => t.slice(0, 5);
    for (const a of assignments) {
      const truckScheds = await db.select().from(deliverySchedules)
        .where(and(eq(deliverySchedules.truckId, a.truckId), eq(deliverySchedules.scheduledDate, a.scheduledDate)));

      const conflict = truckScheds.find((s) => {
        if (s.orderId === orderId) return false;
        if (["completed", "failed"].includes(s.status)) return false;
        const sS = norm(s.scheduledStartTime ?? "");
        const sE = norm(s.scheduledEndTime ?? "");
        return sS && sE && sS < norm(a.scheduledEndTime) && sE > norm(a.scheduledStartTime);
      });

      if (conflict) {
        const [truck] = await db.select().from(trucks).where(eq(trucks.id, a.truckId));
        return res.status(409).json({ error: `รถ ${truck?.registration ?? a.truckId} มีคิวซ้อนทับในช่วงเวลานี้แล้ว` });
      }
    }

    // Replace: delete existing, insert new
    await db.delete(deliverySchedules).where(eq(deliverySchedules.orderId, orderId));
    const created = (await Promise.all(
      assignments.map((a) =>
        db.insert(deliverySchedules).values({
          orderId,
          truckId: a.truckId,
          driverId: null,
          quantityM3: String(a.quantityM3),
          scheduledDate: a.scheduledDate,
          scheduledStartTime: a.scheduledStartTime,
          scheduledEndTime: a.scheduledEndTime,
          dispatcherNotes,
          status: "scheduled",
        }).returning()
      )
    )).flat();

    await db.update(orders).set({ status: "scheduled" }).where(eq(orders.id, orderId));
    res.status(200).json(created);
  } catch (error) {
    console.error("Error replacing schedule:", error);
    res.status(500).json({ error: "Failed to replace schedule" });
  }
};

export const deleteSchedule = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const [schedule] = await db.select().from(deliverySchedules).where(eq(deliverySchedules.id, id));
    if (!schedule) return res.status(404).json({ error: "Schedule not found" });

    await db.delete(deliverySchedules).where(eq(deliverySchedules.id, id));

    // Revert order to "confirmed" only if no more schedules remain
    const remaining = await db.select().from(deliverySchedules).where(eq(deliverySchedules.orderId, schedule.orderId));
    if (remaining.length === 0) {
      await db.update(orders).set({ status: "confirmed" }).where(eq(orders.id, schedule.orderId));
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error deleting schedule:", error);
    res.status(500).json({ error: "Failed to delete schedule" });
  }
};
