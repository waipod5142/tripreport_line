import { getAuth } from "@clerk/express";
import { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "../db/schema";

export const requireRole = (role: string | string[]) =>
  async (req: Request, res: Response, next: NextFunction) => {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const [user] = await db.select().from(users).where(eq(users.id, userId));
    const allowed = Array.isArray(role) ? role : [role];
    if (!user || !allowed.includes(user.role)) return res.status(403).json({ error: "Forbidden" });

    next();
  };
