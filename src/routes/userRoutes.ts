import { Router } from "express";
import {
  changePassword,
  getProfile,
  signOut,
  updateDisplayName,
} from "../controllers/userController";
import { requireAuth } from "../middleware/authMiddleware";

const router = Router();

router.get("/me", requireAuth, getProfile);
router.patch("/me", requireAuth, updateDisplayName);
router.post("/me/change-password", requireAuth, changePassword);
router.post("/sign-out", requireAuth, signOut);

export default router;
