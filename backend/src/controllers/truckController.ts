import { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { trucks } from "../db/schema";

const SEED_TRUCKS = [
  { registration: "82-3041", licensePlateArea: "กทม", truckType: "โม่ใหญ่", capacity: "6.00", colorHex: "#2B6CF0" },
  { registration: "82-3042", licensePlateArea: "กทม", truckType: "โม่ใหญ่", capacity: "6.00", colorHex: "#06C755" },
  { registration: "41-1123", licensePlateArea: "สป",  truckType: "โม่เล็ก", capacity: "2.50", colorHex: "#E08A00" },
  { registration: "82-5567", licensePlateArea: "นบ",  truckType: "โม่ใหญ่", capacity: "6.00", colorHex: "#7C3AED" },
  { registration: "41-2089", licensePlateArea: "สป",  truckType: "โม่เล็ก", capacity: "2.50", colorHex: "#0E97D4" },
];

export const getTrucks = async (_req: Request, res: Response) => {
  try {
    const rows = await db.select().from(trucks).where(eq(trucks.isActive, true));
    res.status(200).json(rows);
  } catch (error) {
    console.error("Error fetching trucks:", error);
    res.status(500).json({ error: "Failed to fetch trucks" });
  }
};

export const seedTrucks = async (_req: Request, res: Response) => {
  try {
    for (const t of SEED_TRUCKS) {
      await db.insert(trucks).values({ ...t, isActive: true }).onConflictDoNothing();
    }
    const rows = await db.select().from(trucks).where(eq(trucks.isActive, true));
    res.status(200).json({ seeded: rows.length, trucks: rows });
  } catch (error) {
    console.error("Error seeding trucks:", error);
    res.status(500).json({ error: "Failed to seed trucks" });
  }
};

export const createTruck = async (req: Request, res: Response) => {
  try {
    const { registration, licensePlateArea, truckType, capacity, colorHex } = req.body;
    const [truck] = await db.insert(trucks).values({ registration, licensePlateArea, truckType, capacity, colorHex }).returning();
    res.status(201).json(truck);
  } catch (error) {
    console.error("Error creating truck:", error);
    res.status(500).json({ error: "Failed to create truck" });
  }
};

export const updateTruck = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const fields = req.body;
    const [updated] = await db.update(trucks).set(fields).where(eq(trucks.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Truck not found" });
    res.status(200).json(updated);
  } catch (error) {
    console.error("Error updating truck:", error);
    res.status(500).json({ error: "Failed to update truck" });
  }
};
