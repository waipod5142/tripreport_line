import { Router } from "express";
import * as ctrl from "../controllers/truckController";
import { requireRole } from "../middleware/requireRole";

const router = Router();

router.get("/",         requireRole(["dispatcher", "admin"]), ctrl.getTrucks);
router.post("/seed",    requireRole(["dispatcher", "admin"]), ctrl.seedTrucks);
router.post("/",        requireRole("admin"), ctrl.createTruck);
router.patch("/:id",    requireRole("admin"), ctrl.updateTruck);

export default router;
