import { Router } from "express";
import { getLineDrivers, updateLineDriver } from "../controllers/lineDriverController";
import { requireRole } from "../middleware/requireRole";

const router = Router();

router.get("/", requireRole(["staff", "admin"]), getLineDrivers);
router.patch("/:lineUserId", requireRole(["staff", "admin"]), updateLineDriver);

export default router;
