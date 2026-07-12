import { Router } from "express";
import { getLineMessages } from "../controllers/lineMessageController";
import { requireRole } from "../middleware/requireRole";

const router = Router();

router.get("/", requireRole(["staff", "admin"]), getLineMessages);

export default router;
