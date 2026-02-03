import { Router } from "express";
import { listTwilioSessions } from "../controllers/twilioSessionController";

const router = Router();

router.get("/voice/sessions", listTwilioSessions);

export default router;
