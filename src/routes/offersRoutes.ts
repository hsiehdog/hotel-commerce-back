import { Router } from "express";
import { generateOffersForChannel } from "../controllers/offersController";
import { requireAuth } from "../middleware/authMiddleware";

const router = Router();

router.post("/generate", requireAuth, generateOffersForChannel);

export default router;
