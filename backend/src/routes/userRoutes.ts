import { Router } from "express";
import { syncUser, getMe, getAllUsers, updateUserRole } from "../controllers/userController";
import { requireAuth } from "@clerk/express";
import { requireRole } from "../middleware/requireRole";

const router = Router();

router.post("/sync", requireAuth(), syncUser);
router.get("/me", requireAuth(), getMe);
router.get("/", requireRole("admin"), getAllUsers);
router.patch("/:id/role", requireRole("admin"), updateUserRole);

export default router;
