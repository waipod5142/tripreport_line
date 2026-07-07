import { Router } from "express";
import { getTrips, getTripSummary, deleteTrip } from "../controllers/tripController";
import { requireRole } from "../middleware/requireRole";

const router = Router();

router.get("/", requireRole(["staff", "admin"]), getTrips);
router.get("/summary", requireRole(["staff", "admin"]), getTripSummary);
router.delete("/:id", requireRole("admin"), deleteTrip);

export default router;
