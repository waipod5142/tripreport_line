import type { Request, Response } from "express";
import * as queries from "../db/queries";
import { eq } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { db } from "../db";
import { users } from "../db/schema";

export async function syncUser(req: Request, res: Response) {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { email, name, imageUrl } = req.body;

    if (!email || !name || !imageUrl) {
      return res.status(400).json({ error: "Email, name, and imageUrl are required" });
    }

    const user = await queries.upsertUser({ id: userId, email, name, imageUrl });

    res.status(200).json(user);
  } catch (error) {
    console.error("Error syncing user:", error);
    res.status(500).json({ error: "Failed to sync user" });
  }
}

export async function getMe(req: Request, res: Response) {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) return res.status(404).json({ error: "User not found" });

    res.status(200).json(user);
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ error: "Failed to fetch user" });
  }
}

export async function updateMe(req: Request, res: Response) {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { phone, role } = req.body;
    const patch: Record<string, string> = {};
    if (phone !== undefined) patch.phone = phone;
    if (role !== undefined) {
      const valid = ["customer", "dispatcher", "driver", "admin"];
      if (!valid.includes(role)) return res.status(400).json({ error: "Invalid role" });
      patch.role = role;
    }

    const [updated] = await db
      .update(users)
      .set(patch)
      .where(eq(users.id, userId))
      .returning();

    if (!updated) return res.status(404).json({ error: "User not found" });

    res.status(200).json(updated);
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ error: "Failed to update user" });
  }
}

export async function getDrivers(_req: Request, res: Response) {
  try {
    const rows = await db.select().from(users).where(eq(users.role, "driver"));
    res.status(200).json(rows);
  } catch (error) {
    console.error("Error fetching drivers:", error);
    res.status(500).json({ error: "Failed to fetch drivers" });
  }
}

export async function getAllUsers(_req: Request, res: Response) {
  try {
    const rows = await db.select().from(users).orderBy(users.createdAt);
    res.status(200).json(rows);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
}

export async function updateUserRole(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { role } = req.body;

    const validRoles = ["customer", "dispatcher", "driver", "admin"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    const [updated] = await db
      .update(users)
      .set({ role })
      .where(eq(users.id, id))
      .returning();

    if (!updated) return res.status(404).json({ error: "User not found" });

    res.status(200).json(updated);
  } catch (error) {
    console.error("Error updating user role:", error);
    res.status(500).json({ error: "Failed to update user role" });
  }
}
