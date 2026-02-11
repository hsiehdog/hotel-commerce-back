import { Router } from "express";
import { generateOffersForChannel } from "../controllers/offersController";

const router = Router();

router.post("/generate", generateOffersForChannel);

export default router;
