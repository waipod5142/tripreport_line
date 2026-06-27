import { Router } from "express";
import * as ctrl from "../controllers/scheduleController";
import { requireRole } from "../middleware/requireRole";
import { requireAuth } from "@clerk/express";

const router = Router();

router.get("/",              requireRole(["dispatcher", "admin"]), ctrl.getSchedule);
router.post("/",             requireRole("dispatcher"), ctrl.createSchedule);
router.put("/",              requireRole("dispatcher"), ctrl.replaceSchedule);
router.patch("/:id/status",  requireAuth(), ctrl.updateScheduleStatus);
router.patch("/:id",         requireRole("dispatcher"), ctrl.updateScheduleTimes);
router.delete("/:id",        requireRole("dispatcher"), ctrl.deleteSchedule);

export default router;
