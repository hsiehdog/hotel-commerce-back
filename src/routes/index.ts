import { Router } from "express";
import aiRoutes from "./aiRoutes";
import userRoutes from "./userRoutes";
import healthRoutes from "./healthRoutes";
import twilioRoutes from "./twilioRoutes";

const router = Router();

router.use("/ai", aiRoutes);
router.use("/users", userRoutes);
router.use("/twilio", twilioRoutes);
router.use(healthRoutes);

export default router;
