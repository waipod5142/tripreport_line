import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { db } from "../db";
import { users } from "../db/schema";
import { ENV } from "../config/env";

const VALID_ROLES = ["pending", "staff", "admin"];

export async function syncUser(req: Request, res: Response) {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { email, name, imageUrl } = req.body;
    if (!email || !name || !imageUrl) {
      return res.status(400).json({ error: "Email, name, and imageUrl are required" });
    }

    // Bootstrap: the ADMIN_EMAIL account is always admin, so a fresh DB can't lock you out
    const isBootstrapAdmin =
      !!ENV.ADMIN_EMAIL && String(email).toLowerCase() === ENV.ADMIN_EMAIL.toLowerCase();
    const profile = { email, name, imageUrl };

    const [user] = await db
      .insert(users)
      .values({ id: userId, ...profile, ...(isBootstrapAdmin ? { role: "admin" } : {}) })
      .onConflictDoUpdate({
        target: users.id,
        set: { ...profile, ...(isBootstrapAdmin ? { role: "admin" } : {}) },
      })
      .returning();

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

    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    const [updated] = await db.update(users).set({ role }).where(eq(users.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "User not found" });

    res.status(200).json(updated);
  } catch (error) {
    console.error("Error updating user role:", error);
    res.status(500).json({ error: "Failed to update user role" });
  }
}
