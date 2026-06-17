import { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { concreteProducts } from "../db/schema";

const SEED_GRADES = [
  { name: "คอนกรีตผสมเสร็จ 180 ksc",   grade: "180", slump: "7.5", useCase: "งานเทพื้น เทหล่อทั่วไป งานเบา",           pricePerCubicMeter: "1850.00", minOrderM3: "1.00" },
  { name: "คอนกรีตผสมเสร็จ 210 ksc",   grade: "210", slump: "10",  useCase: "พื้น คาน เสาบ้านพักอาศัย",               pricePerCubicMeter: "1980.00", minOrderM3: "1.00" },
  { name: "คอนกรีตผสมเสร็จ 240 ksc",   grade: "240", slump: "10",  useCase: "งานโครงสร้างทั่วไป อาคาร 2–3 ชั้น",     pricePerCubicMeter: "2120.00", minOrderM3: "1.00" },
  { name: "คอนกรีตผสมเสร็จ 280 ksc",   grade: "280", slump: "12.5",useCase: "โครงสร้างรับน้ำหนัก อาคารสูง",          pricePerCubicMeter: "2290.00", minOrderM3: "1.50" },
  { name: "คอนกรีตผสมเสร็จ 320 ksc",   grade: "320", slump: "12.5",useCase: "เสาเข็ม ฐานราก งานรับแรงสูง",            pricePerCubicMeter: "2480.00", minOrderM3: "1.50" },
  { name: "คอนกรีตกำลังอัดสูง 350 ksc", grade: "350", slump: "15",  useCase: "งานพิเศษ พื้น Post-tension",            pricePerCubicMeter: "2640.00", minOrderM3: "2.00" },
  { name: "คอนกรีตกำลังอัดสูง 400 ksc", grade: "400", slump: "15",  useCase: "โครงสร้างพิเศษ สะพาน เสาสูง",          pricePerCubicMeter: "2880.00", minOrderM3: "2.00" },
];

export const getAllConcreteProducts = async (req: Request, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(concreteProducts)
      .where(eq(concreteProducts.isActive, true))
      .orderBy(concreteProducts.grade);
    res.status(200).json(rows);
  } catch (error) {
    console.error("Error fetching concrete products:", error);
    res.status(500).json({ error: "Failed to fetch concrete products" });
  }
};

export const getConcreteProductById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const [row] = await db
      .select()
      .from(concreteProducts)
      .where(eq(concreteProducts.id, id));
    if (!row) return res.status(404).json({ error: "Product not found" });
    res.status(200).json(row);
  } catch (error) {
    console.error("Error fetching concrete product:", error);
    res.status(500).json({ error: "Failed to fetch concrete product" });
  }
};

export const createConcreteProduct = async (req: Request, res: Response) => {
  try {
    const { name, description, grade, slump, useCase, pricePerCubicMeter, minOrderM3, imageUrl } = req.body;
    const [created] = await db
      .insert(concreteProducts)
      .values({ name, description, grade, slump, useCase, pricePerCubicMeter, minOrderM3, imageUrl })
      .returning();
    res.status(201).json(created);
  } catch (error) {
    console.error("Error creating concrete product:", error);
    res.status(500).json({ error: "Failed to create concrete product" });
  }
};

export const updateConcreteProduct = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, grade, slump, useCase, pricePerCubicMeter, minOrderM3, imageUrl } = req.body;
    const [updated] = await db
      .update(concreteProducts)
      .set({ name, description, grade, slump, useCase, pricePerCubicMeter, minOrderM3, imageUrl })
      .where(eq(concreteProducts.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: "Product not found" });
    res.status(200).json(updated);
  } catch (error) {
    console.error("Error updating concrete product:", error);
    res.status(500).json({ error: "Failed to update concrete product" });
  }
};

export const deleteConcreteProduct = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const [deleted] = await db
      .update(concreteProducts)
      .set({ isActive: false })
      .where(eq(concreteProducts.id, id))
      .returning();
    if (!deleted) return res.status(404).json({ error: "Product not found" });
    res.status(200).json({ message: "Product deactivated" });
  } catch (error) {
    console.error("Error deleting concrete product:", error);
    res.status(500).json({ error: "Failed to delete concrete product" });
  }
};

export const seedConcreteProducts = async (req: Request, res: Response) => {
  try {
    const existing = await db.select().from(concreteProducts);
    if (existing.length > 0) {
      return res.status(200).json({ message: "Already seeded", count: existing.length });
    }
    const inserted = await db.insert(concreteProducts).values(SEED_GRADES).returning();
    res.status(201).json({ message: "Seeded successfully", count: inserted.length, products: inserted });
  } catch (error) {
    console.error("Error seeding concrete products:", error);
    res.status(500).json({ error: "Failed to seed concrete products" });
  }
};
