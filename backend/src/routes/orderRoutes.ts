import { Router } from "express";
import * as ctrl from "../controllers/orderController";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";

const router = Router();

router.post("/",               requireAuth(), ctrl.createOrder);
router.get("/my",              requireAuth(), ctrl.getMyOrders);
router.get("/",                requireRole(["dispatcher", "admin"]), ctrl.getAllOrders);
router.patch("/:id/status",    requireRole("dispatcher"), ctrl.updateOrderStatus);
router.delete("/:id",          requireAuth(), ctrl.deleteOrder);

export default router;
