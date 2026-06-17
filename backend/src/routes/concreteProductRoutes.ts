import { Router } from "express";
import * as ctrl from "../controllers/concreteProductController";
import { requireRole } from "../middleware/requireRole";

const router = Router();

router.get("/",       ctrl.getAllConcreteProducts);
router.get("/:id",    ctrl.getConcreteProductById);
router.post("/seed",  requireRole("admin"), ctrl.seedConcreteProducts);
router.post("/",      requireRole("admin"), ctrl.createConcreteProduct);
router.patch("/:id",  requireRole("admin"), ctrl.updateConcreteProduct);
router.delete("/:id", requireRole("admin"), ctrl.deleteConcreteProduct);

export default router;
