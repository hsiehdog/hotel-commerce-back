import { Router } from "express";
import userRoutes from "./userRoutes";
import twilioRoutes from "./twilioRoutes";
import twilioSessionRoutes from "./twilioSessionRoutes";

const router = Router();

router.use("/users", userRoutes);
router.use("/twilio", twilioRoutes);
router.use("/twilio", twilioSessionRoutes);

export default router;
