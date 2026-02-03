import { Router } from "express";
import { handleIncomingVoice } from "../controllers/twilioVoiceController";

const router = Router();

router.post("/voice/incoming", handleIncomingVoice);

export default router;
